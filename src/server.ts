import * as http from 'http';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { debug } from './common/debug';
import * as vscode from 'vscode';
import { WebSocketServer, WebSocket } from 'ws';
import { renderMarkdown, escapeHtml, rewriteHtmlLinks, md } from './markdown/renderer';
import { THEMES } from './templates/themes';
import { handleTree } from './routes/tree';
import { handleFile } from './routes/file';
import { handleFileIndex } from './routes/fileIndex';
import { handleStatic } from './routes/static';
import { handlePreview } from './routes/preview';
import { handleXref } from './routes/xref';
import { kindFromPath, toPosix } from './routes/utils';
import type { DocKind, DocEntry } from './routes/types';

import pageCss from './templates/page.css';
import mdTemplate from './templates/markdown-page.html';
import htmlSnippet from './templates/html-snippet.html';
import { tocJs } from './templates/toc-common';

let preactJs = '';
try { preactJs = fs.readFileSync(path.join(__dirname, 'preview.js'), 'utf8'); } catch {}
if (!preactJs) {
	try { preactJs = fs.readFileSync(path.join(__dirname, '..', 'dist', 'preview.js'), 'utf8'); } catch {}
}

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

	start(preferredPort = 5757, host = '0.0.0.0'): Promise<number> {
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

	private renderPage(kind: DocKind, id: string, title: string, content: string, fullPath: string, rootDir: string): { page: string; bodyHtml?: string } {
		const relPath = computeDisplayPath(fullPath);
		if (kind === 'html') {
			return { page: htmlPageTemplate(id, content, title, fullPath, relPath, rootDir) };
		}
		const docDir = path.dirname(fullPath);
		const bodyHtml = renderMarkdown(content, docDir, rootDir, id);
		return { page: markdownPageTemplate(id, title, bodyHtml, fullPath, relPath, rootDir), bodyHtml };
	}

	registerDocument(uriKey: string, title: string, content: string, kind: DocKind, rootDir: string, fullPath: string): string {
		debug('register:', `file=${fullPath} rootDir=${rootDir || '(none)'} kind=${kind} contentLen=${content.length}`);
		let id = this.uriToId.get(uriKey);
		if (!id) {
			id = crypto.createHash('sha256').update(uriKey).digest('hex').slice(0, 12);
			this.uriToId.set(uriKey, id);
		}
		const existing = this.docs.get(id);
		const rendered = this.renderPage(kind, id, title, content, fullPath, rootDir);
		this.docs.set(id, {
			id,
			title,
			fullPath,
			kind,
			page: rendered.page,
			bodyHtml: rendered.bodyHtml,
			rootDir,
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
		const rendered = this.renderPage(kind, id, title, content, fullPath, entry.rootDir);
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
		return `http://127.0.0.1:${this.port}/preview/${id}`;
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
		const url = req.url || '';
		const { pathname } = new URL(url, 'http://localhost');
		const typedReq = { url } as { url: string };
		const typedReqWithHeaders = { url, headers: req.headers };

		if (pathname === '/api/tree')          return handleTree(typedReq, res, this.docs);
		if (pathname === '/api/file')          return handleFile(typedReq, res, this.docs);
		if (pathname === '/api/file-index')    return handleFileIndex(typedReq, res, this.docs);
		if (pathname.startsWith('/preview/'))  {
			const staticMatch = pathname.match(/^\/preview\/([a-f0-9]+)\/(.+)$/);
			if (staticMatch)                   return handleStatic(typedReqWithHeaders, res, this.docs, this.uriToId, (a, b, c, d, e, f) => this.registerDocument(a, b, c, d as DocKind, e, f));
			const pageMatch = pathname.match(/^\/preview\/([a-f0-9]+)\/?$/);
			if (pageMatch)                     return handlePreview(typedReq, res, this.docs, (a, b, c, d, e, f) => this.registerDocument(a, b, c, d as DocKind, e, f));
		}
		if (/^\/xref\b/.test(url))            return handleXref(typedReq, res, this.docs, this.uriToId);

		res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
		res.end('Not found');
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
			ws.on('close', () => entry.clients.delete(ws));
		});
	}
}
