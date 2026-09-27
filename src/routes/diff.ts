import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { debugWarn } from '../common/debug';
import { isDangerousRootDir, toPosix } from './utils';
import { renderMarkdown } from '../markdown/renderer';
import type { DocEntry } from './types';

export interface DiffRange {
	type: 'add' | 'del';
	startLine: number;
	endLine: number;
}

export interface DiffResponse {
	ranges: DiffRange[];
	source: 'workspace' | 'commit' | 'none';
	/** Rendered HTML of the "to" side when it's a commit (null when workspace) */
	toHtml?: string | null;
	error?: string;
}

type Resp = { writeHead(code: number, headers?: Record<string, string>): void; end(body?: string | Buffer): void };

export function runGit(args: string[], cwd: string, timeoutMs = 5000): Promise<string> {
	return new Promise((resolve) => {
		const proc = spawn('git', args, { cwd, timeout: timeoutMs });
		let out = '';
		let err = '';
		proc.stdout.on('data', (d) => { out += d; });
		proc.stderr.on('data', (d) => { err += d; });
		proc.on('close', (code) => {
			// git diff --no-index exits 1 when files differ; stdout has the diff
			if (out || code === 0) resolve(out); else resolve(err);
		});
		proc.on('error', () => { resolve(''); });
	});
}

// Parse unified diff, returning ranges with line numbers from the requested side.
// side 'new' = "+" line nums (right side), side 'old' = "-" line nums (left side).
export function parseUnifiedDiff(diff: string, side: 'old' | 'new' = 'new'): DiffRange[] {
	const ranges: DiffRange[] = [];
	const lines = diff.split('\n');
	let oldLine = 0;
	let newLine = 0;
	const cur = () => side === 'old' ? oldLine : newLine;
	for (const line of lines) {
		const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
		if (hunkMatch) {
			oldLine = parseInt(hunkMatch[1], 10);
			newLine = parseInt(hunkMatch[2], 10);
			continue;
		}
		if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ') || line.startsWith('index ')) continue;
		if (line.startsWith('+')) {
			ranges.push({ type: 'add', startLine: cur(), endLine: cur() });
			newLine++;
		} else if (line.startsWith('-')) {
			ranges.push({ type: 'del', startLine: cur(), endLine: cur() });
			oldLine++;
		} else if (line.startsWith(' ') || line === '') {
			oldLine++;
			newLine++;
		}
	}
	return ranges;
}

// Merge consecutive ranges of same type
export function mergeRanges(ranges: DiffRange[]): DiffRange[] {
	if (ranges.length <= 1) return ranges;
	const sorted = [...ranges].sort((a, b) => a.startLine - b.startLine || a.type.localeCompare(b.type));
	const out: DiffRange[] = [];
	let cur = { ...sorted[0] };
	for (let i = 1; i < sorted.length; i++) {
		const r = sorted[i];
		if (r.type === cur.type && r.startLine <= cur.endLine + 1) {
			cur.endLine = Math.max(cur.endLine, r.endLine);
		} else {
			out.push(cur);
			cur = { ...r };
		}
	}
	out.push(cur);
	return out;
}

/**
 * Build the git diff command output for a from..to range.
 * Invariant: the rendered "to" side must be on the RIGHT side of the diff
 * so that +line numbers always correspond to the rendered content.
 */
export async function buildDiff(
	rootDir: string,
	relFile: string,
	fullPath: string,
	from: string,
	to: string,
): Promise<string> {
	const isFromWorkspace = from === 'workspace';
	const isToWorkspace = to === 'workspace';

	if (isFromWorkspace && isToWorkspace) return '';
	if (isFromWorkspace && !isToWorkspace) {
		// Rendering "to" commit. Write to-content to tmp, diff workspace..tmp
		// so +nums = to-content line numbers.
		const toContent = await runGit(['show', `${to}:${relFile}`], rootDir);
		if (!toContent || toContent.startsWith('fatal')) return '';
		const tmp = path.join(rootDir, '.onair-diff-tmp');
		fs.writeFileSync(tmp, toContent);
		try {
			const d = await runGit(['diff', '--no-index', '--', fullPath, tmp], rootDir);
			return d.replace(/b\/\.onair-diff-tmp/g, 'b/' + relFile);
		} finally {
			try { fs.unlinkSync(tmp); } catch {}
		}
	}
	if (!isFromWorkspace && isToWorkspace) {
		// Rendering workspace. git diff <from> -- file: +nums = workspace.
		return runGit(['diff', from, '--', relFile], rootDir);
	}
	// Rendering "to" commit. git diff <from>..<to>: +nums = to.
	return runGit(['diff', `${from}..${to}`, '--', relFile], rootDir);
}

export function handleDiff(
	req: { url: string },
	res: Resp,
	docs: Map<string, DocEntry>,
): void {
	const url = new URL(req.url || '', 'http://localhost');
	const id = url.searchParams.get('id');
	const range = url.searchParams.get('range') || 'auto';
	const from = url.searchParams.get('from') || '';
	const to = url.searchParams.get('to') || '';

	const entry = id ? docs.get(id) : undefined;
	if (!entry) {
		res.writeHead(404, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'not found' }));
		return;
	}

	const rootDir = entry.rootDir;
	if (!rootDir || isDangerousRootDir(rootDir) || !entry.fullPath) {
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ ranges: [], source: 'none' }));
		return;
	}

	const relFile = toPosix(path.relative(rootDir, entry.fullPath));

	const send = (source: DiffResponse['source'], ranges: DiffRange[], toHtml?: string | null) => {
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ ranges: mergeRanges(ranges), source, toHtml: toHtml ?? null }));
	};

	// Fetch file content at a commit and render it
	const renderAtCommit = (commit: string): Promise<string | null> =>
		runGit(['show', `${commit}:${relFile}`], rootDir).then((content) => {
			if (!content || content.startsWith('fatal')) return null;
			try { return renderMarkdown(content, path.dirname(entry.fullPath!), rootDir, id!); }
			catch { return null; }
		});

	// Custom range: commit..commit, commit..workspace, or workspace..commit
	if (range === 'commits' && from && to) {
		const isToWorkspace = to === 'workspace';
		const isFromWorkspace = from === 'workspace';

		Promise.all([
			buildDiff(rootDir, relFile, entry.fullPath!, from, to),
			isToWorkspace ? Promise.resolve(null) : renderAtCommit(to),
		]).then(([diff, toHtml]) => {
			if (!diff.trim()) { send('none', [], toHtml); return; }
			send('commit', parseUnifiedDiff(diff), toHtml);
		});
		return;
	}

	// Default: workspace vs HEAD, fallback to HEAD vs HEAD~1
	runGit(['diff', 'HEAD', '--', relFile], rootDir).then((wsDiff) => {
		if (wsDiff.trim()) {
			send('workspace', parseUnifiedDiff(wsDiff));
			return;
		}
		return runGit(['diff', 'HEAD~1', 'HEAD', '--', relFile], rootDir).then((lastDiff) => {
			if (lastDiff.trim()) {
				send('commit', parseUnifiedDiff(lastDiff));
				return;
			}
			send('none', []);
		});
	});
}

// List recent commits touching this file
export function handleDiffCommits(
	req: { url: string },
	res: Resp,
	docs: Map<string, DocEntry>,
): void {
	const url = new URL(req.url || '', 'http://localhost');
	const id = url.searchParams.get('id');

	const entry = id ? docs.get(id) : undefined;
	if (!entry || !entry.rootDir || !entry.fullPath || isDangerousRootDir(entry.rootDir)) {
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ commits: [] }));
		return;
	}

	const relFile = toPosix(path.relative(entry.rootDir, entry.fullPath));
	runGit(['log', '-20', '--format=%H\t%h\t%s', '--', relFile], entry.rootDir).then((out) => {
		const commits = out.trim().split('\n').filter(Boolean).map((line) => {
			const [hash, shortHash, ...rest] = line.split('\t');
			return { hash, shortHash, message: rest.join('\t') };
		});
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ commits }));
	});
}
