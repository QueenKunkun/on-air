import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { diffWords } from 'diff';
import { debugWarn } from '../common/debug';
import { isDangerousRootDir, toPosix } from './utils';
import { renderMarkdown } from '../markdown/renderer';
import type { DocEntry } from './types';

export interface DiffRange {
	type: 'add' | 'del';
	startLine: number;
	endLine: number;
	/** Added words (new-side text) for paired modifications; absent otherwise. */
	words?: string[];
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
//
// Modification pairing: within a hunk, a maximal run of '-' lines immediately
// followed by '+' lines pairs i-th del with i-th add. Paired adds carry the
// added `words` for word-level highlighting; paired dels are dropped (the add
// at the same position already signals the change — a red marker would paint
// over the green). Unpaired leftovers keep plain line ranges.
export function parseUnifiedDiff(diff: string, side: 'old' | 'new' = 'new'): DiffRange[] {
	const ranges: DiffRange[] = [];
	const lines = diff.split('\n');
	let oldLine = 0;
	let newLine = 0;
	const cur = () => side === 'old' ? oldLine : newLine;
	let delRun: { num: number; text: string }[] = [];
	let addRun: { num: number; text: string }[] = [];

	const flush = () => {
		const n = Math.min(delRun.length, addRun.length);
		for (let i = 0; i < n; i++) {
			const words = diffAddedWords(delRun[i].text, addRun[i].text);
			const num = addRun[i].num;
			ranges.push(words.length
				? { type: 'add', startLine: num, endLine: num, words }
				: { type: 'add', startLine: num, endLine: num });
		}
		for (let i = n; i < addRun.length; i++) {
			const num = addRun[i].num;
			ranges.push({ type: 'add', startLine: num, endLine: num });
		}
		for (let i = n; i < delRun.length; i++) {
			const num = delRun[i].num;
			ranges.push({ type: 'del', startLine: num, endLine: num });
		}
		delRun = [];
		addRun = [];
	};

	for (const line of lines) {
		const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
		if (hunkMatch) {
			flush();
			oldLine = parseInt(hunkMatch[1], 10);
			newLine = parseInt(hunkMatch[2], 10);
			continue;
		}
		if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ') || line.startsWith('index ')) { flush(); continue; }
		if (line.startsWith('+')) {
			addRun.push({ num: cur(), text: line.slice(1) });
			newLine++;
		} else if (line.startsWith('-')) {
			if (addRun.length > 0) flush(); // '-' after '+' starts a new run
			delRun.push({ num: cur(), text: line.slice(1) });
			oldLine++;
		} else if (line.startsWith(' ') || line === '') {
			flush();
			oldLine++;
			newLine++;
		} else {
			flush(); // '\ No newline at end of file' etc.
		}
	}
	flush();
	return ranges;
}

// Word-level diff of a paired old/new line, returning added word strings.
// Uses Intl.Segmenter for scripts without spaces (zh/ja/ko/th); the default
// tokenizer would treat a whole CJK sentence as one token and mark it all.
export function diffAddedWords(oldLine: string, newLine: string): string[] {
	if (oldLine === newLine) return [];
	const seg = segmenterFor(oldLine + '\n' + newLine);
	let parts;
	try {
		parts = seg ? diffWords(oldLine, newLine, { intlSegmenter: seg }) : diffWords(oldLine, newLine);
	} catch {
		return [];
	}
	if (!parts) return [];
	const out: string[] = [];
	for (const p of parts) {
		if (!p.added) continue;
		const w = p.value.trim();
		if (w && !out.includes(w)) out.push(w);
	}
	return out;
}

const segmenterCache = new Map<string, Intl.Segmenter>();

function segmenterFor(text: string): Intl.Segmenter | undefined {
	let locale: string | undefined;
	if (/[\u3040-\u30ff]/.test(text)) locale = 'ja'; // hiragana/katakana
	else if (/[\u4e00-\u9fff]/.test(text)) locale = 'zh'; // hanzi (also kanji)
	else if (/[\uac00-\ud7af]/.test(text)) locale = 'ko'; // hangul
	else if (/[\u0e00-\u0e7f]/.test(text)) locale = 'th'; // thai
	if (!locale || typeof Intl.Segmenter === 'undefined') return undefined;
	let s = segmenterCache.get(locale);
	if (!s) {
		try {
			s = new Intl.Segmenter(locale, { granularity: 'word' });
		} catch {
			return undefined;
		}
		segmenterCache.set(locale, s);
	}
	return s;
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
			if (r.words?.length) cur.words = [...(cur.words ?? []), ...r.words.filter(w => !cur.words?.includes(w))];
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
	runGit(['log', '-20', '--format=%H\t%h\t%ad\t%s', '--date=short', '--', relFile], entry.rootDir).then((out) => {
		const commits = out.trim().split('\n').filter(Boolean).map((line) => {
			const [hash, shortHash, date, ...rest] = line.split('\t');
			return { hash, shortHash, date, message: rest.join('\t') };
		});
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ commits }));
	});
}
