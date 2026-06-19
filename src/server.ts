import * as http from 'http';
import * as crypto from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js/lib/core';

// Only register the languages we actually want to highlight, instead of pulling in
// highlight.js's full language set (~190 languages, ~1MB+) via the default import.
// This keeps the bundled extension small. Add more `registerLanguage` calls here
// if a commonly-requested language is missing.
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import java from 'highlight.js/lib/languages/java';
import csharp from 'highlight.js/lib/languages/csharp';
import cpp from 'highlight.js/lib/languages/cpp';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import php from 'highlight.js/lib/languages/php';
import ruby from 'highlight.js/lib/languages/ruby';
import swift from 'highlight.js/lib/languages/swift';
import kotlin from 'highlight.js/lib/languages/kotlin';
import sql from 'highlight.js/lib/languages/sql';
import bash from 'highlight.js/lib/languages/bash';
import shell from 'highlight.js/lib/languages/shell';
import json from 'highlight.js/lib/languages/json';
import yaml from 'highlight.js/lib/languages/yaml';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import markdown from 'highlight.js/lib/languages/markdown';
import diff from 'highlight.js/lib/languages/diff';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('java', java);
hljs.registerLanguage('csharp', csharp);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('go', go);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('php', php);
hljs.registerLanguage('ruby', ruby);
hljs.registerLanguage('swift', swift);
hljs.registerLanguage('kotlin', kotlin);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('shell', shell);
hljs.registerLanguage('json', json);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('css', css);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('diff', diff);

export type DocKind = 'markdown' | 'html';

interface DocEntry {
	id: string;
	title: string;
	kind: DocKind;
	page: string;
	bodyHtml?: string;
	clients: Set<WebSocket>;
}

function highlightCode(code: string, lang: string): string {
	if (lang && hljs.getLanguage(lang)) {
		try {
			return hljs.highlight(code, { language: lang }).value;
		} catch {
			// Fall back to plain text if highlighting fails, so rendering is unaffected
		}
	}
	return md.utils.escapeHtml(code);
}

const md: MarkdownIt = new MarkdownIt({
	html: true,
	linkify: true,
	typographer: true,
	highlight: (code, lang) => `<pre class="hljs"><code>${highlightCode(code, lang)}</code></pre>`,
});

function renderMarkdown(source: string): string {
	return md.render(source);
}

function escapeHtml(s: string): string {
	const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
	return s.replace(/[&<>"']/g, (c) => map[c]);
}
const PAGE_CSS = `
	:root { color-scheme: light dark; }
	body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; background: #fff; color: #1f2328; }
	.markdown-body { max-width: 860px; margin: 0 auto; padding: 32px 24px 80px; line-height: 1.65; }
	.markdown-body h1, .markdown-body h2 { border-bottom: 1px solid #d8dee4; padding-bottom: .3em; }
	.markdown-body pre { background: #f6f8fa; padding: 12px 16px; overflow: auto; border-radius: 6px; }
	.markdown-body code { background: #f6f8fa; padding: .2em .4em; border-radius: 4px; font-size: 85%; }
	.markdown-body pre code { background: none; padding: 0; }
	.markdown-body table { border-collapse: collapse; width: 100%; }
	.markdown-body table, .markdown-body th, .markdown-body td { border: 1px solid #d8dee4; padding: 6px 12px; }
	.markdown-body blockquote { border-left: 4px solid #d8dee4; color: #59636e; margin: 0; padding: 0 1em; }
	.markdown-body img { max-width: 100%; }
	#banner { position: sticky; top: 0; z-index: 10; background: #ddf4ff; color: #0969da; font-size: 13px; padding: 6px 16px; text-align: center; }
	#banner.offline { background: #fff1e5; color: #bc4c00; }
	.hljs { color: #24292e; }
	.hljs-comment, .hljs-quote { color: #6a737d; }
	.hljs-keyword, .hljs-selector-tag, .hljs-literal, .hljs-subst { color: #d73a49; }
	.hljs-number, .hljs-template-variable { color: #005cc5; }
	.hljs-string, .hljs-doctag, .hljs-regexp { color: #032f62; }
	.hljs-title, .hljs-section, .hljs-selector-id, .hljs-type { color: #6f42c1; }
	.hljs-name, .hljs-tag { color: #22863a; }
	.hljs-attr, .hljs-attribute, .hljs-meta { color: #005cc5; }
	.hljs-symbol, .hljs-bullet, .hljs-addition { color: #22863a; }
	.hljs-deletion { color: #b31d28; }
	.hljs-built_in, .hljs-builtin-name { color: #005cc5; }
	.hljs-emphasis { font-style: italic; }
	.hljs-strong { font-weight: bold; }
	@media (prefers-color-scheme: dark) {
		body { background: #0d1117; color: #e6edf3; }
		.markdown-body pre, .markdown-body code { background: #161b22; }
		.markdown-body table, .markdown-body th, .markdown-body td { border-color: #30363d; }
		.markdown-body blockquote { color: #9198a1; border-left-color: #30363d; }
		.hljs { color: #c9d1d9; }
		.hljs-comment, .hljs-quote { color: #8b949e; }
		.hljs-keyword, .hljs-selector-tag, .hljs-literal, .hljs-subst { color: #ff7b72; }
		.hljs-number, .hljs-template-variable { color: #79c0ff; }
		.hljs-string, .hljs-doctag, .hljs-regexp { color: #a5d6ff; }
		.hljs-title, .hljs-section, .hljs-selector-id, .hljs-type { color: #d2a8ff; }
		.hljs-name, .hljs-tag { color: #7ee787; }
		.hljs-attr, .hljs-attribute, .hljs-meta { color: #79c0ff; }
		.hljs-symbol, .hljs-bullet, .hljs-addition { color: #7ee787; }
		.hljs-deletion { color: #ffa198; }
		.hljs-built_in, .hljs-builtin-name { color: #79c0ff; }
	}
`;
/** Markdown preview page: wrapped in our own template, content updates use targeted DOM replacement (no full page reload) */
function markdownPageTemplate(id: string, title: string, bodyHtml: string): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(title)} · OnAir</title>
<style>${PAGE_CSS}</style>
</head>
<body>
	<div class="md-online-banner" id="banner">🔌 Connected, live preview active…</div>
	<article class="markdown-body" id="content">${bodyHtml}</article>
	<script>
	(function () {
		var bannerEl = document.getElementById('banner');
		var contentEl = document.getElementById('content');
		var id = ${JSON.stringify(id)};
		var proto = location.protocol === 'https:' ? 'wss' : 'ws';
		var ws, reconnectTimer;

		function connect() {
			ws = new WebSocket(proto + '://' + location.host + '/ws/' + id);
			ws.onopen = function () {
				bannerEl.textContent = '🔌 Connected, live preview active…';
				bannerEl.classList.remove('offline');
				clearTimeout(reconnectTimer);
			};
			ws.onmessage = function (ev) {
				try {
					var msg = JSON.parse(ev.data);
					if (msg.type === 'update') {
						contentEl.innerHTML = msg.html;
						document.title = msg.title + ' · OnAir';
					} else if (msg.type === 'closed') {
						bannerEl.textContent = '⚠️ Source file was closed in VS Code, preview will no longer update';
						bannerEl.classList.add('offline');
					}
				} catch (e) { /* ignore malformed message */ }
			};
			ws.onclose = function () {
				bannerEl.textContent = '⚠️ Connection lost, reconnecting…';
				bannerEl.classList.add('offline');
				reconnectTimer = setTimeout(connect, 1500);
			};
		}
		connect();
	})();
	</script>
</body>
</html>`;
}
/**
 * HTML preview page: the user's HTML is already a complete page (with its own
 * <head>/styles/scripts), so we can't wrap it in our template. Instead we inject
 * a small badge + a reconnect script into its existing content. Content updates
 * trigger a full page reload (location.reload) rather than a targeted replacement,
 * since arbitrary HTML/JS/CSS can't be safely patched via innerHTML.
 */
function htmlLiveReloadSnippet(id: string): string {
	return `
<div id="__onair_banner__" style="position:fixed!important;bottom:12px!important;right:12px!important;z-index:2147483647!important;background:#0969da!important;color:#fff!important;font:12px -apple-system,BlinkMacSystemFont,sans-serif!important;padding:6px 10px!important;border-radius:6px!important;box-shadow:0 2px 8px rgba(0,0,0,.25)!important;opacity:.88!important;pointer-events:none!important;">🔌 OnAir live preview active…</div>
<script>
(function () {
	var bannerEl = document.getElementById('__onair_banner__');
	var id = ${JSON.stringify(id)};
	var proto = location.protocol === 'https:' ? 'wss' : 'ws';
	var ws, reconnectTimer;

	function connect() {
		ws = new WebSocket(proto + '://' + location.host + '/ws/' + id);
		ws.onopen = function () {
			bannerEl.textContent = '🔌 OnAir live preview active…';
			bannerEl.style.background = '#0969da';
			clearTimeout(reconnectTimer);
		};
		ws.onmessage = function (ev) {
			try {
				var msg = JSON.parse(ev.data);
				if (msg.type === 'reload') {
					location.reload();
				} else if (msg.type === 'closed') {
					bannerEl.textContent = '⚠️ Source file was closed in VS Code';
					bannerEl.style.background = '#bc4c00';
				}
			} catch (e) { /* ignore malformed message */ }
		};
		ws.onclose = function () {
			bannerEl.textContent = '⚠️ Connection lost, reconnecting…';
			bannerEl.style.background = '#bc4c00';
			reconnectTimer = setTimeout(connect, 1500);
		};
	}
	connect();
})();
</script>`;
}

function htmlPageTemplate(id: string, rawHtml: string): string {
	const snippet = htmlLiveReloadSnippet(id);
	const bodyCloseRegex = /<\/body\s*>/i;
	if (bodyCloseRegex.test(rawHtml)) {
		return rawHtml.replace(bodyCloseRegex, snippet + '</body>');
	}
	// No </body> found (e.g. it's just an HTML fragment) - append at the end
	return rawHtml + snippet;
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

	start(preferredPort = 5757): Promise<number> {
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
				this.server.listen(port, '127.0.0.1', () => {
					this.server.removeListener('error', onError);
					this.port = port;
					resolve(port);
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

	private renderPage(kind: DocKind, id: string, title: string, content: string): { page: string; bodyHtml?: string } {
		if (kind === 'html') {
			return { page: htmlPageTemplate(id, content) };
		}
		const bodyHtml = renderMarkdown(content);
		return { page: markdownPageTemplate(id, title, bodyHtml), bodyHtml };
	}
	/** Register/refresh a document, returning its preview id (calling this multiple times for the same file reuses the same id/link) */
	registerDocument(uriKey: string, title: string, content: string, kind: DocKind): string {
		let id = this.uriToId.get(uriKey);
		if (!id) {
			id = crypto.randomBytes(6).toString('hex');
			this.uriToId.set(uriKey, id);
		}
		const existing = this.docs.get(id);
		const rendered = this.renderPage(kind, id, title, content);
		this.docs.set(id, {
			id,
			title,
			kind,
			page: rendered.page,
			bodyHtml: rendered.bodyHtml,
			clients: existing?.clients ?? new Set<WebSocket>(),
		});
		return id;
	}

	updateDocument(uriKey: string, title: string, content: string, kind: DocKind): void {
		const id = this.uriToId.get(uriKey);
		if (!id) { return; }
		const entry = this.docs.get(id);
		if (!entry) { return; }
		entry.title = title;
		entry.kind = kind;
		const rendered = this.renderPage(kind, id, title, content);
		entry.page = rendered.page;
		entry.bodyHtml = rendered.bodyHtml;

		const payload = kind === 'markdown'
			? JSON.stringify({ type: 'update', title, html: entry.bodyHtml })
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
			// Keep it around for a few seconds so any open browser tabs can receive the "closed" notice before cleanup
			setTimeout(() => this.docs.delete(id as string), 5000);
		}
		this.uriToId.delete(uriKey);
	}

	buildUrl(id: string): string {
		return `http://127.0.0.1:${this.port}/preview/${id}`;
	}

	private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
		const url = req.url || '';
		const match = url.match(/^\/preview\/([a-f0-9]+)\/?$/);
		if (match) {
			const entry = this.docs.get(match[1]);
			if (!entry) {
				res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
				res.end('Preview not found or has been closed. Please regenerate the link in VS Code.');
				return;
			}
			res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
			res.end(entry.page);
			return;
		}
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
