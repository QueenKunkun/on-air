import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { isMarkdownExt } from '../common/extensions';
import { isDangerousRootDir, toPosix } from './utils';
import { escapeHtml } from '../markdown/renderer';
import type { DocEntry } from './types';

/**
 * Path-proximity score between a candidate file and the source file: smaller is
 * closer. Based on the shared path prefix (longer shared prefix = closer) with a
 * tie-breaker on total depth (shallower candidate ranks higher).
 */
function proximity(candidate: string, source?: string): number {
	if (!source) { return Number.MAX_SAFE_INTEGER; }
	const a = path.resolve(candidate).split(path.sep);
	const b = path.resolve(source).split(path.sep);
	let shared = 0;
	while (shared < Math.min(a.length, b.length) && a[shared] === b[shared]) { shared++; }
	return -(shared * 1000) + a.length;
}

/**
 * Human-friendly path shown under the filename in the TOC.
 */
function computeDisplayPath(fsPath: string): string {
	if (!fsPath || !path.isAbsolute(fsPath)) { return toPosix(fsPath || ''); }
	try {
		const wsFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(fsPath));
		if (wsFolder) {
			const rel = toPosix(path.relative(wsFolder.uri.fsPath, fsPath));
			const folders = vscode.workspace.workspaceFolders || [];
			return folders.length > 1 ? toPosix(path.join(path.basename(wsFolder.uri.fsPath), rel)) : rel;
		}
	} catch {
		// not a resolvable workspace file - fall through
	}
	let dir = path.dirname(fsPath);
	for (;;) {
		try { if (fs.existsSync(path.join(dir, '.git'))) { return toPosix(path.relative(path.dirname(dir), fsPath)); } }
		catch { /* ignore and keep walking up */ }
		const parent = path.dirname(dir);
		if (parent === dir) { break; }
		dir = parent;
	}
	return toPosix(fsPath);
}

/**
 * Minimal OnAir-styled picker page for `/xref`.
 */
function xrefPage(files: string[], q: string, sourceTitle: string | null, sourcePath: string | null, fragment = false): string {
	const srcRel = sourceTitle && sourcePath ? computeDisplayPath(sourcePath) : null;
	const header = `<h1>${escapeHtml(q)}</h1>` + (srcRel ? `<p class="src">${escapeHtml(srcRel)}</p>` : '');
	let body: string;
	if (!files.length) {
		body = `<p class="empty">No matching <code>${escapeHtml(q)}</code> found in this project.</p>`;
	} else {
		const lis = files.map(f => {
			const rel = sourceTitle ? computeDisplayPath(f) : f;
			const uriKey = vscode.Uri.file(f).toString();
			const id = crypto.createHash('sha256').update(uriKey).digest('hex').slice(0, 12);
			return `<li><a class="path" href="/preview/${id}?file=${encodeURIComponent(f)}">${escapeHtml(rel)}</a></li>`;
		}).join('');
		body = `<ul>${lis}</ul>`;
	}
	if (fragment) { return header + body; }
	const head = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device,initial-scale=1">` +
		`<title>OnAir · ${escapeHtml(q)}</title>` +
		`<style>
			:root{--bg:#fff;--fg:#1f2328;--muted:#57606a;--border:#d0d7de;--accent:#0969da;--pre:#f6f8fa}
			@media (prefers-color-scheme: dark){:root{--bg:#0d1117;--fg:#e6edf3;--muted:#8b949e;--border:#30363d;--accent:#58a6ff;--pre:#161b22}}
			body{font:14px/1.6 system-ui,sans-serif;background:var(--bg);color:var(--fg);margin:0;padding:24px}
			h1{font-size:16px;margin:0}a{color:var(--accent);text-decoration:none}
			a:hover{text-decoration:underline}
			.src{color:var(--muted);font-size:12px;font-family:ui-monospace,monospace;padding:0 16px;margin:2px 0 0;word-break:break-all}
			ul{list-style:none;margin:0;padding:0 16px 16px;max-width:680px}
			li{padding:4px 0;line-height:1.8;border-bottom:1px solid var(--border)}
			.path{display:inline;color:var(--accent);font-size:13px;font-family:ui-monospace,monospace;word-break:break-all;text-decoration:none}
			.path:hover{text-decoration:underline;text-underline-offset:2px}
			.empty{color:var(--muted)}
		</style>`;
	return head + header + body;
}

export function handleXref(
	req: { url: string },
	res: { writeHead(code: number, headers?: Record<string, string>): void; end(body?: string | Buffer): void },
	docs: Map<string, DocEntry>,
	uriToId: Map<string, string>,
): void {
	const url = req.url || '';
	const m = url.match(/^\/xref\??([#?].*)?$/);
	if (!m) { return; }
	const params = new URLSearchParams(url.includes('?') ? url.slice(url.indexOf('?') + 1) : '');
	const q = (params.get('q') || '').trim();
	const fromId = params.get('from');
	const fragment = params.get('fragment') === '1';
	const fromEntry = fromId ? docs.get(fromId) : undefined;
	const sourcePath = fromEntry?.fullPath;

	res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
	if (!q) {
		res.end(xrefPage([], q, fromEntry?.title ?? null, sourcePath ?? null, fragment));
		return;
	}

	const rootDir = fromEntry?.rootDir || '';
	const matches: string[] = [];
	if (rootDir && !isDangerousRootDir(rootDir)) {
		const XREF_MAX_DEPTH = 15;
		const walk = (dir: string, depth: number = 0): void => {
			if (depth > XREF_MAX_DEPTH) return;
			let entries: fs.Dirent[];
			try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
			catch { return; }
			for (const e of entries) {
				const full = path.join(dir, e.name);
				if (e.isDirectory()) {
					if (e.name === 'node_modules' || e.name === '.git') { continue; }
					walk(full, depth + 1);
				} else if (e.isFile()) {
					const ext = path.extname(e.name).toLowerCase();
					if (isMarkdownExt(ext) && e.name.toLowerCase() === q.toLowerCase()) {
						matches.push(full);
					}
				}
			}
		};
		walk(rootDir);
	}

	const sorted = matches
		.filter(p => !sourcePath || path.resolve(p) !== path.resolve(sourcePath))
		.sort((a, b) => proximity(a, sourcePath) - proximity(b, sourcePath));

	if (sorted.length === 1) {
		const uriKey = vscode.Uri.file(sorted[0]).toString();
		const id = uriToId.get(uriKey) || crypto.createHash('sha256').update(uriKey).digest('hex').slice(0, 12);
		res.writeHead(302, { Location: `/preview/${id}?file=${encodeURIComponent(sorted[0])}` });
		res.end();
		return;
	}
	res.end(xrefPage(sorted, q, fromEntry?.title ?? null, sourcePath ?? null, fragment));
}
