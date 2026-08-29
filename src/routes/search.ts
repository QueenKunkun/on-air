import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { debugWarn } from '../common/debug';
import { isDangerousRootDir, toPosix, shouldSkipDir, isHidden, isBinaryFile } from './utils';
import { getRgPath } from './ripgrep';
import type { DocEntry } from './types';

export interface SearchResult {
	file: string;       // relative path from rootDir
	line: number;       // 1-based line number
	column: number;     // 1-based column (start of match)
	text: string;       // the matched line (without trailing newline)
}

export interface SearchResponse {
	results: SearchResult[];
	truncated: boolean;
	engine: 'ripgrep' | 'node';
	error?: string;
}

const MAX_RESULTS_CAP = 1000;
const DEFAULT_MAX_RESULTS = 200;
const SEARCH_TIMEOUT_MS = 10000;

type Resp = { writeHead(code: number, headers?: Record<string, string>): void; end(body?: string | Buffer): void };

export function handleSearch(
	req: { url: string },
	res: Resp,
	docs: Map<string, DocEntry>,
): void {
	const u = new URL(req.url || '', 'http://localhost');
	const id = u.searchParams.get('id') || '';
	const q = (u.searchParams.get('q') || '').trim();
	const useRegex = u.searchParams.get('regex') === '1';
	const caseSensitive = u.searchParams.get('caseSensitive') === '1';
	const fileGlob = (u.searchParams.get('glob') || '').trim();
	const max = Math.min(
		Math.max(parseInt(u.searchParams.get('max') || '', 10) || DEFAULT_MAX_RESULTS, 1),
		MAX_RESULTS_CAP,
	);

	const entry = docs.get(id);
	if (!entry) {
		res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
		res.end(JSON.stringify({ error: 'Preview not found' }));
		return;
	}
	if (!q) {
		res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
		res.end(JSON.stringify({ results: [], truncated: false, engine: 'node' }));
		return;
	}
	const rootDirResolved = path.resolve(entry.rootDir);
	if (isDangerousRootDir(entry.rootDir)) {
		debugWarn('/api/search: rootDir empty or unsafe, returning empty results.', `file=${entry.fullPath} rootDir=${JSON.stringify(entry.rootDir)}`);
		res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
		res.end(JSON.stringify({ results: [], truncated: false, engine: 'node' }));
		return;
	}

	const rg = getRgPath();
	if (rg) {
		runRipgrep(rg, rootDirResolved, q, useRegex, caseSensitive, fileGlob, max)
			.then(out => send(res, out))
			.catch(err => {
				debugWarn('/api/search: ripgrep failed, falling back to Node grep.', String(err));
				send(res, runNodeGrep(rootDirResolved, q, useRegex, caseSensitive, max));
			});
		return;
	}

	send(res, runNodeGrep(rootDirResolved, q, useRegex, caseSensitive, max));
}

function send(res: Resp, body: SearchResponse): void {
	res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
	res.end(JSON.stringify(body));
}

function runRipgrep(
	rg: string,
	rootDir: string,
	q: string,
	useRegex: boolean,
	caseSensitive: boolean,
	fileGlob: string,
	max: number,
): Promise<SearchResponse> {
	return new Promise((resolve, reject) => {
		const args = [
			'--json',
			'--line-number',
			'--column',
			'--no-heading',
			'--with-filename',
			'--color=never',
			'--encoding', 'utf-8',
			'--max-depth', '15',
		];
		if (useRegex) {
			args.push('-e', q);
		} else {
			args.push('--fixed-strings', '-e', q);
		}
		if (!caseSensitive) { args.push('--ignore-case'); }
		if (fileGlob) { args.push('--glob', fileGlob); }
		// Always skip VCS / dependency dirs regardless of .gitignore.
		args.push('--glob', '!node_modules', '--glob', '!.git', '--glob', '!.vscode');
		args.push(rootDir);

		const child = spawn(rg, args, { cwd: rootDir });
		const results: SearchResult[] = [];
		let truncated = false;
		let buf = '';
		let done = false;

		const finish = () => {
			if (done) { return; }
			done = true;
		};

		const timer = setTimeout(() => {
			truncated = results.length >= max;
			try { child.kill('SIGKILL'); } catch { /* already gone */ }
			finish();
			resolve({ results, truncated, engine: 'ripgrep' });
		}, SEARCH_TIMEOUT_MS);

		child.stdout?.setEncoding('utf-8');
		child.stdout?.on('data', (chunk: string) => {
			buf += chunk;
			let nl: number;
			while ((nl = buf.indexOf('\n')) >= 0) {
				const line = buf.slice(0, nl);
				buf = buf.slice(nl + 1);
				if (!line.trim()) { continue; }
				let obj: any;
				try { obj = JSON.parse(line); } catch { continue; }
				if (obj.type !== 'match') { continue; }
				const d = obj.data;
				const abs = d.path?.text as string | undefined;
				const text = d.lines?.text as string | undefined;
				if (!abs || text == null) { continue; }
				results.push({
					file: toPosix(path.relative(rootDir, abs)),
					line: d.line_number || 0,
					column: d.column || 0,
					text: text.replace(/\r?\n$/, ''),
				});
				if (results.length >= max) {
					truncated = true;
					clearTimeout(timer);
					try { child.kill('SIGKILL'); } catch { /* ignore */ }
					finish();
					resolve({ results, truncated, engine: 'ripgrep' });
					return;
				}
			}
		});

		child.on('error', (err) => {
			clearTimeout(timer);
			finish();
			reject(err);
		});

		child.on('close', () => {
			clearTimeout(timer);
			if (done) { return; }
			finish();
			resolve({ results, truncated: truncated || results.length >= max, engine: 'ripgrep' });
		});
	});
}

function buildMatcher(q: string, useRegex: boolean, caseSensitive: boolean): (s: string) => boolean {
	if (useRegex) {
		let re: RegExp;
		try {
			re = new RegExp(q, caseSensitive ? '' : 'i');
		} catch {
			// Invalid regex — fall back to a literal substring match.
			return buildMatcher(q, false, caseSensitive);
		}
		return (s: string) => re.test(s);
	}
	const needle = caseSensitive ? q : q.toLowerCase();
	return (s: string) => (caseSensitive ? s : s.toLowerCase()).includes(needle);
}

function runNodeGrep(
	rootDir: string,
	q: string,
	useRegex: boolean,
	caseSensitive: boolean,
	max: number,
): SearchResponse {
	const results: SearchResult[] = [];
	let truncated = false;
	const matcher = buildMatcher(q, useRegex, caseSensitive);

	const walk = (dir: string, depth: number): void => {
		if (depth > 15 || truncated) { return; }
		let dirents: fs.Dirent[];
		try { dirents = fs.readdirSync(dir, { withFileTypes: true }); }
		catch { return; }
		for (const e of dirents) {
			if (truncated) { return; }
			if (isHidden(e.name)) { continue; }
			const full = path.join(dir, e.name);
			if (e.isDirectory()) {
				if (shouldSkipDir(e.name)) { continue; }
				walk(full, depth + 1);
			} else if (e.isFile()) {
				if (isBinaryFile(full)) { continue; }
				let content: string;
				try { content = fs.readFileSync(full, 'utf8'); }
				catch { continue; }
				const lines = content.split(/\r?\n/);
				for (let i = 0; i < lines.length; i++) {
					if (matcher(lines[i])) {
						results.push({
							file: toPosix(path.relative(rootDir, full)),
							line: i + 1,
							column: 0,
							text: lines[i],
						});
						if (results.length >= max) {
							truncated = true;
							return;
						}
					}
				}
			}
		}
	};

	walk(rootDir, 0);
	return { results, truncated, engine: 'node' };
}
