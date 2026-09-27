import { spawn } from 'child_process';
import * as path from 'path';
import { debugWarn } from '../common/debug';
import { isDangerousRootDir, toPosix } from './utils';
import type { DocEntry } from './types';

export interface DiffRange {
	type: 'add' | 'del';
	startLine: number;
	endLine: number;
}

export interface DiffResponse {
	ranges: DiffRange[];
	source: 'workspace' | 'commit' | 'none';
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
			// deleted lines don't exist in current file — skip
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

	const send = (source: DiffResponse['source'], ranges: DiffRange[]) => {
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ ranges: mergeRanges(ranges), source }));
	};

	// Custom range: commit..commit, commit..workspace, or workspace..commit
	if (range === 'commits' && from && to) {
		let gitArgs: string[];
		if (from === 'workspace') {
			gitArgs = ['diff', to, '--', relFile]; // commit → workspace
		} else if (to === 'workspace') {
			gitArgs = ['diff', from, '--', relFile]; // commit → workspace
		} else {
			gitArgs = ['diff', `${from}..${to}`, '--', relFile];
		}
		runGit(gitArgs, rootDir).then((diff) => {
			if (!diff.trim()) { send('none', []); return; }
			send('commit', parseUnifiedDiff(diff));
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
