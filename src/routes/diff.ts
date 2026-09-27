import { spawn } from 'child_process';
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

function runGit(args: string[], cwd: string, timeoutMs = 5000): Promise<string> {
	return new Promise((resolve) => {
		const proc = spawn('git', args, { cwd, timeout: timeoutMs });
		let out = '';
		let err = '';
		proc.stdout.on('data', (d) => { out += d; });
		proc.stderr.on('data', (d) => { err += d; });
		proc.on('close', (code) => { resolve(code === 0 ? out : err); });
		proc.on('error', () => { resolve(''); });
	});
}

function parseUnifiedDiff(diff: string): DiffRange[] {
	const ranges: DiffRange[] = [];
	const lines = diff.split('\n');
	let newLine = 0;
	for (const line of lines) {
		const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
		if (hunkMatch) {
			newLine = parseInt(hunkMatch[1], 10);
			continue;
		}
		if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ') || line.startsWith('index ')) continue;
		if (line.startsWith('+')) {
			ranges.push({ type: 'add', startLine: newLine, endLine: newLine });
			newLine++;
		} else if (line.startsWith('-')) {
			// Deleted line: exists in "from" but not "to". Mark the position in
			// the "to" file where it was removed (current newLine).
			ranges.push({ type: 'del', startLine: newLine, endLine: newLine });
		} else if (line.startsWith(' ') || line === '') {
			newLine++;
		}
	}
	return ranges;
}

// Merge consecutive ranges of same type
function mergeRanges(ranges: DiffRange[]): DiffRange[] {
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
		let gitArgs: string[];
		if (from === 'workspace') {
			gitArgs = ['diff', to, '--', relFile];
		} else if (isToWorkspace) {
			gitArgs = ['diff', from, '--', relFile];
		} else {
			gitArgs = ['diff', `${from}..${to}`, '--', relFile];
		}
		Promise.all([
			runGit(gitArgs, rootDir),
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
