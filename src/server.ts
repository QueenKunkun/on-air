import * as http from 'http';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { debug } from './common/debug';
import { DEFAULT_PORT } from './common/constants';
import * as vscode from 'vscode';
import { WebSocketServer, WebSocket } from 'ws';
import { renderMarkdown, escapeHtml, rewriteHtmlLinks, md } from './markdown/renderer';
import type { DocKind, DocEntry, CiteStyle } from './routes/types';
import { THEMES } from './templates/themes';
import { handleTree } from './routes/tree';
import { handleFile } from './routes/file';
import { handleFileIndex } from './routes/fileIndex';
import { handleStatic } from './routes/static';
import { handlePreview } from './routes/preview';
import { handleXref } from './routes/xref';
import { toPosix, mimeType } from './routes/utils';

import pageCss from './templates/page.css';
import katexCss from 'katex/dist/katex.min.css';
import mdTemplate from './templates/markdown-page.html';
import htmlSnippet from './templates/html-snippet.html';
import imgTemplate from './templates/image-page.html';
import { tocJs } from './templates/toc-common';

let preactJs = '';
try { preactJs = fs.readFileSync(path.join(__dirname, 'preview.js'), 'utf8'); } catch {}
if (!preactJs) {
	try { preactJs = fs.readFileSync(path.join(__dirname, '..', 'dist', 'preview.js'), 'utf8'); } catch {}
}

// KaTeX fonts are copied to dist/katex/fonts at build time (node_modules is not
// shipped in the .vsix). The fallback covers running server.ts directly via tsx
// (tests), where __dirname is src/ instead of dist/.
const katexFontsDir = (() => {
	const candidates = [
		path.join(__dirname, 'katex', 'fonts'),
		path.join(__dirname, '..', 'dist', 'katex', 'fonts'),
	];
	for (const dir of candidates) {
		try { if (fs.existsSync(path.join(dir, 'KaTeX_Main-Regular.woff2'))) { return dir; } } catch { /* try next */ }
	}
	return candidates[0];
})();

// Re-export DocKind for extension.ts compatibility
export type { DocKind } from './routes/types';

// Extension version, shown in the preview corner.
declare const __ONAIR_VERSION__: string;
const EXT_VERSION = (() => {
	if (__ONAIR_VERSION__) { return __ONAIR_VERSION__; }
	try {
		const ext = vscode.extensions.getExtension('onair.on-air');
		if (ext && ext.packageJSON && ext.packageJSON.version) {
			return String(ext.packageJSON.version);
		}
	} catch { /* not in a VS Code context */ }
	return '';
})();

function computeDisplayPath(fsPath: string): string {
	if (!fsPath || !path.isAbsolute(fsPath)) { return toPosix(fsPath || ''); }
	try {
		const wsFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(fsPath));
		if (wsFolder) {
			const rel = toPosix(path.relative(wsFolder.uri.fsPath, fsPath));
			const folders = vscode.workspace.workspaceFolders || [];
			return folders.length > 1 ? toPosix(path.join(path.basename(wsFolder.uri.fsPath), rel)) : rel;
		}
	} catch { /* fall through */ }
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

function markdownPageTemplate(id: string, title: string, bodyHtml: string, fullPath: string, relPath: string, rootDir: string): string {
	return mdTemplate
		.replace(/\{\{CSS\}\}/g, () => pageCss)
		.replace(/\{\{KATEX_CSS\}\}/g, () => katexCss.replace(/url\(\s*['"]?fonts\//g, 'url(/__onair__/katex/fonts/'))
		.replace(/\{\{THEMES\}\}/g, () => JSON.stringify(THEMES))
		.replace(/\{\{ID\}\}/g, () => id)
		.replace(/\{\{TITLE\}\}/g, () => escapeHtml(title))
		.replace(/\{\{BODY\}\}/g, () => bodyHtml)
		.replace(/\{\{VERSION\}\}/g, () => escapeHtml(EXT_VERSION))
		.replace(/\{\{VERSION_JSON\}\}/g, () => JSON.stringify(EXT_VERSION))
		.replace(/\{\{ID_JSON\}\}/g, () => JSON.stringify(id))
		.replace(/\{\{FULL_PATH_JSON\}\}/g, () => JSON.stringify(fullPath))
		.replace(/\{\{REL_PATH_JSON\}\}/g, () => JSON.stringify(relPath))
		.replace(/\{\{ROOT_DIR_JSON\}\}/g, () => JSON.stringify(rootDir || ''))
		.replace(/\{\{FULL_PATH_ATTR\}\}/g, () => escapeHtml(fullPath))
		.replace(/\{\{ROOT_DIR_ATTR\}\}/g, () => escapeHtml(rootDir || ''))
		.replace(/\{\{PREACT_JS\}\}/g, () => preactJs);
}

function htmlLiveReloadSnippet(id: string, title: string, fullPath: string, relPath: string): string {
	return htmlSnippet
		.replace(/\{\{CSS\}\}/g, () => pageCss)
		.replace(/\{\{ID_JSON\}\}/g, () => JSON.stringify(id))
		.replace(/\{\{TITLE_JSON\}\}/g, () => JSON.stringify(title))
		.replace(/\{\{VERSION\}\}/g, () => escapeHtml(EXT_VERSION))
		.replace(/\{\{FULL_PATH_JSON\}\}/g, () => JSON.stringify(fullPath))
		.replace(/\{\{REL_PATH_JSON\}\}/g, () => JSON.stringify(relPath))
		.replace(/\{\{TOC_JS\}\}/g, () => tocJs);
}

function htmlPageTemplate(id: string, rawHtml: string, title: string, fullPath: string, relPath: string, rootDir: string): string {
	const snippet = htmlLiveReloadSnippet(id, title, fullPath, relPath);
	let withSnippet: string;
	const bodyCloseRegex = /<\/body\s*>/i;
	if (bodyCloseRegex.test(rawHtml)) {
		withSnippet = rawHtml.replace(bodyCloseRegex, snippet + '</body>');
	} else {
		withSnippet = rawHtml + snippet;
	}
	const headOpenRegex = /<head[^>]*>/i;
	if (!/<base[^>]*>/i.test(withSnippet) && headOpenRegex.test(withSnippet)) {
		withSnippet = withSnippet.replace(headOpenRegex, (tag) => `${tag}\n<base href="/preview/${id}/" />`);
	}
	const docDir = path.dirname(fullPath);
	withSnippet = rewriteHtmlLinks(withSnippet, docDir, rootDir);
	return withSnippet;
}

const IMAGE_MIME: Record<string, string> = {
	'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
	'.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif',
	'.bmp': 'image/bmp', '.ico': 'image/x-icon', '.svg': 'image/svg+xml',
};

function imagePageTemplate(id: string, title: string, dataUrl: string, fullPath: string, relPath: string, rootDir: string, size: number): string {
	return imgTemplate
		.replace(/\{\{CSS\}\}/g, () => pageCss)
		.replace(/\{\{THEMES\}\}/g, () => JSON.stringify(THEMES))
		.replace(/\{\{ID\}\}/g, () => id)
		.replace(/\{\{ID_JSON\}\}/g, () => JSON.stringify(id))
		.replace(/\{\{TITLE\}\}/g, () => escapeHtml(title))
		.replace(/\{\{SRC\}\}/g, () => dataUrl)
		.replace(/\{\{SIZE_JSON\}\}/g, () => JSON.stringify(`${(size / 1024).toFixed(1)} KB`))
		.replace(/\{\{FULL_PATH_JSON\}\}/g, () => JSON.stringify(fullPath))
		.replace(/\{\{FULL_PATH_ATTR\}\}/g, () => escapeHtml(fullPath))
		.replace(/\{\{ROOT_DIR_JSON\}\}/g, () => JSON.stringify(rootDir || ''))
		.replace(/\{\{ROOT_DIR_ATTR\}\}/g, () => escapeHtml(rootDir || ''))
		.replace(/\{\{VERSION\}\}/g, () => escapeHtml(EXT_VERSION))
		.replace(/\{\{VERSION_JSON\}\}/g, () => JSON.stringify(EXT_VERSION))
		.replace(/\{\{PREACT_JS\}\}/g, () => preactJs);
}

export class PreviewServer {
	private server: http.Server;
	private wss: WebSocketServer;
	private docs = new Map<string, DocEntry>();
	private uriToId = new Map<string, string>();
	public port = 0;

	constructor() {
		this.server = http.createServer((req, res) => this.handleRequest(req, res));
		this.wss = new WebSocketServer({ noServer: true });
		this.server.on('upgrade', (req, socket, head) => this.handleUpgrade(req, socket, head));
	}

	start(preferredPort = DEFAULT_PORT, host = '0.0.0.0'): Promise<number> {
		return new Promise((resolve, reject) => {
			const tryListen = (port: number, attemptsLeft: number) => {
				const onError = (err: NodeJS.ErrnoException) => {
					if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
						tryListen(port + 1, attemptsLeft - 1);
					} else {
						reject(err);
					}
				};
				this.server.once('error', onError);
				this.server.listen(port, host, () => {
					this.server.removeListener('error', onError);
					const addr = this.server.address();
					this.port = typeof addr === 'object' && addr ? addr.port : port;
					resolve(this.port);
				});
			};
			tryListen(preferredPort, 30);
		});
	}

	stop(): void {
		for (const entry of this.docs.values()) {
			for (const client of entry.clients) { client.close(); }
		}
		this.wss.close();
		this.server.close();
	}

	private renderPage(kind: DocKind, id: string, title: string, content: string, fullPath: string, rootDir: string, citeStyle?: CiteStyle): { page: string; bodyHtml?: string } {
		const relPath = computeDisplayPath(fullPath);
		if (kind === 'html') {
			return { page: htmlPageTemplate(id, content, title, fullPath, relPath, rootDir) };
		}
		if (kind === 'image') {
			const ext = path.extname(fullPath).toLowerCase();
			const mime = IMAGE_MIME[ext] || 'application/octet-stream';
			try {
				const buf = fs.readFileSync(fullPath);
				const b64 = buf.toString('base64');
				const dataUrl = `data:${mime};base64,${b64}`;
				return { page: imagePageTemplate(id, title, dataUrl, fullPath, relPath, rootDir, buf.length) };
			} catch {
				return { page: imagePageTemplate(id, title, '', fullPath, relPath, rootDir, 0) };
			}
		}
		const docDir = path.dirname(fullPath);
		const bodyHtml = renderMarkdown(content, docDir, rootDir, id, { citeStyle });
		return { page: markdownPageTemplate(id, title, bodyHtml, fullPath, relPath, rootDir), bodyHtml };
	}

	registerDocument(uriKey: string, title: string, content: string, kind: DocKind, rootDir: string, fullPath: string): string {
		console.log('[on-air] register:', uriKey, '→ id=', this.uriToId.get(uriKey) ?? '(new)');
		debug('register:', `file=${fullPath} rootDir=${rootDir || '(none)'} kind=${kind} contentLen=${content.length}`);
		let id = this.uriToId.get(uriKey);
		if (!id) {
			id = crypto.createHash('sha256').update(uriKey).digest('hex').slice(0, 12);
			this.uriToId.set(uriKey, id);
		}
		const existing = this.docs.get(id);
		const citeStyle = existing?.citeStyle ?? 'link';
		const rendered = this.renderPage(kind, id, title, content, fullPath, rootDir, citeStyle);
		this.docs.set(id, {
			id,
			title,
			fullPath,
			kind,
			page: rendered.page,
			bodyHtml: rendered.bodyHtml,
			rootDir,
			content,
			citeStyle,
			clients: existing?.clients ?? new Set<WebSocket>(),
		});
		return id;
	}

	updateDocument(uriKey: string, title: string, content: string, kind: DocKind, fullPath: string): void {
		const id = this.uriToId.get(uriKey);
		if (!id) { return; }
		const entry = this.docs.get(id);
		if (!entry) { return; }
		entry.title = title;
		entry.fullPath = fullPath;
		entry.kind = kind;
		entry.content = content;
		const rendered = this.renderPage(kind, id, title, content, fullPath, entry.rootDir, entry.citeStyle);
		entry.page = rendered.page;
		entry.bodyHtml = rendered.bodyHtml;

		const payload = kind === 'markdown'
			? JSON.stringify({ type: 'update', title, html: entry.bodyHtml, fullPath, relPath: computeDisplayPath(fullPath) })
			: JSON.stringify({ type: 'reload' });
		for (const client of entry.clients) {
			if (client.readyState === client.OPEN) { client.send(payload); }
		}
	}

	closeDocument(uriKey: string): void {
		const id = this.uriToId.get(uriKey);
		if (!id) { return; }
		const entry = this.docs.get(id);
		if (entry) {
			const payload = JSON.stringify({ type: 'closed' });
			for (const client of entry.clients) {
				if (client.readyState === client.OPEN) { client.send(payload); }
			}
			setTimeout(() => this.docs.delete(id as string), 5000);
		}
		this.uriToId.delete(uriKey);
	}

	broadcastFileTreeChange(paths: string[]): void {
		const payload = JSON.stringify({ type: 'filetree-changed', paths });
		for (const entry of this.docs.values()) {
			for (const client of entry.clients) {
				if (client.readyState === client.OPEN) { client.send(payload); }
			}
		}
	}

	buildUrl(id: string): string {
		const url = `http://127.0.0.1:${this.port}/preview/${id}`;
		console.log('[on-air] buildUrl:', url, 'docs.has=', this.docs.has(id), 'port=', this.port);
		return url;
	}

	renderHtmlForUri(uriKey: string): string | null {
		const id = this.uriToId.get(uriKey);
		if (!id) { return null; }
		const entry = this.docs.get(id);
		if (!entry) { return null; }
		return `<!-- onair:export:md -->\n${entry.page}`;
	}

	getLanIp(): string | null {
		const interfaces = os.networkInterfaces();
		for (const iface of Object.values(interfaces)) {
			if (!iface) { continue; }
			for (const entry of iface) {
				if (entry.family === 'IPv4' && !entry.internal) {
					return entry.address;
				}
			}
		}
		return null;
	}

	private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
		const rawUrl = req.url || '';
		const pathname = new URL(rawUrl, 'http://localhost').pathname;
		console.log('[on-air] handleRequest:', pathname, 'docs.size=', this.docs.size, 'port=', this.port);
		const typedReq = { url: rawUrl } as { url: string };
		const typedReqWithHeaders = { url: rawUrl, headers: req.headers };

		if (pathname === '/api/tree')          return handleTree(typedReq, res, this.docs);
		if (pathname === '/api/file')          return handleFile(typedReq, res, this.docs);
		if (pathname === '/api/file-index')    return handleFileIndex(typedReq, res, this.docs);
		if (pathname.startsWith('/preview/'))  {
			// Use rawUrl (not pathname) for static matching to preserve ".."
			// segments — new URL() normalizes /preview/ID/../x to /preview/x,
			// breaking the ID capture group.
			const staticMatch = rawUrl.match(/^\/preview\/([a-f0-9]+)\/(.+)$/);
			if (staticMatch)                   return handleStatic(typedReqWithHeaders, res, this.docs, this.uriToId, (a, b, c, d, e, f) => this.registerDocument(a, b, c, d as DocKind, e, f));
			const pageMatch = pathname.match(/^\/preview\/([a-f0-9]+)\/?$/);
			if (pageMatch)                     return handlePreview(typedReq, res, this.docs, (a, b, c, d, e, f) => this.registerDocument(a, b, c, d as DocKind, e, f));
		}
		if (/^\/xref\b/.test(rawUrl))         return handleXref(typedReq, res, this.docs, this.uriToId);
		if (pathname.startsWith('/__onair__/katex/fonts/')) return this.handleKatexFont(pathname, res);

		// Fallback: ID-less /preview/ path — try to resolve from Referer
		if (pathname.startsWith('/preview/') && !pathname.match(/^\/preview\/[a-f0-9]+/)) {
			this.handleFallbackFromReferer(req, res, rawUrl);
			if (res.writableEnded) return;
		}

		res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
		res.end('Not found');
	}

	private handleKatexFont(pathname: string, res: http.ServerResponse): void {
		const file = decodeURIComponent(pathname.slice('/__onair__/katex/fonts/'.length));
		if (!/^[\w-]+\.(?:woff2?|ttf)$/i.test(file)) {
			res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
			res.end('Bad request');
			return;
		}
		const filePath = path.join(katexFontsDir, file);
		try {
			const data = fs.readFileSync(filePath);
			const mime = /\.woff2$/i.test(file) ? 'font/woff2'
				: /\.woff$/i.test(file) ? 'font/woff'
				: 'font/ttf';
			res.writeHead(200, {
				'Content-Type': mime,
				'Cache-Control': 'public, max-age=31536000, immutable',
			});
			res.end(data);
		} catch {
			res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
			res.end('Not found');
		}
	}

	// Fallback for ID-less /preview/ paths: the browser resolved a relative URL
	// (e.g. ../public/icon/foo.svg) against <base href="/preview/ID/">, stripping
	// the ID. Look up the document from the Referer header, walk up from the
	// document's directory (within rootDir bounds) to find the referenced file.
	private handleFallbackFromReferer(req: http.IncomingMessage, res: http.ServerResponse, rawUrl: string): void {
		const refMatch = (req.headers.referer || '').match(/\/preview\/([a-f0-9]+)/);
		if (!refMatch) return;
		const refEntry = this.docs.get(refMatch[1]);
		if (!refEntry) return;
		const rel = decodeURIComponent(rawUrl.replace(/^\/preview\//, ''));
		const docDir = path.dirname(refEntry.fullPath);
		const resolvedRoot = refEntry.rootDir ? path.resolve(refEntry.rootDir) : null;
		// Walk up from docDir to find the file. Stop at rootDir's parent — the
		// walk-up must not escape the workspace. This allows resolving references
		// like ../public/icon/foo.svg when rootDir equals docDir (no workspace).
		const stopDir = resolvedRoot ? path.dirname(resolvedRoot) : null;
		let dir = docDir;
		for (let i = 0; i < 10; i++) {
			// Don't walk above rootDir's parent (security boundary).
			if (stopDir && !dir.startsWith(stopDir) && dir !== stopDir) break;
			const candidate = path.resolve(dir, rel);
			try {
				const data = fs.readFileSync(candidate);
				res.writeHead(200, { 'Content-Type': mimeType(candidate) }); res.end(data);
				return;
			} catch { /* file doesn't exist at this level */ }
			const parent = path.dirname(dir);
			if (parent === dir) break;
			dir = parent;
		}
	}

	private handleUpgrade(req: http.IncomingMessage, socket: import('stream').Duplex, head: Buffer): void {
		const url = req.url || '';
		const match = url.match(/^\/ws\/([a-f0-9]+)\/?$/);
		if (!match) {
			socket.destroy();
			return;
		}
		const id = match[1];
		this.wss.handleUpgrade(req, socket, head, (ws) => {
			const entry = this.docs.get(id);
			if (!entry) {
				ws.close();
				return;
			}
			entry.clients.add(ws);
			ws.on('message', (data) => {
				let msg: { type?: string; style?: string } | null = null;
				try { msg = JSON.parse(data.toString()); } catch { /* ignore malformed */ }
				if (!msg || msg.type !== 'set-cite-style' || (msg.style !== 'link' && msg.style !== 'footnotes')) {
					return;
				}
				if (entry.citeStyle === msg.style) { return; }
				entry.citeStyle = msg.style;
				if (entry.kind !== 'markdown' || !entry.content) { return; }
				const rendered = this.renderPage(entry.kind, entry.id, entry.title, entry.content, entry.fullPath, entry.rootDir, entry.citeStyle);
				entry.page = rendered.page;
				entry.bodyHtml = rendered.bodyHtml;
				const payload = JSON.stringify({
					type: 'update',
					title: entry.title,
					html: entry.bodyHtml,
					fullPath: entry.fullPath,
					relPath: computeDisplayPath(entry.fullPath),
				});
				for (const client of entry.clients) {
					if (client.readyState === client.OPEN) { client.send(payload); }
				}
			});
			ws.on('close', () => entry.clients.delete(ws));
		});
	}
}
