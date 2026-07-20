import * as http from 'http';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { WebSocketServer, WebSocket } from 'ws';
import MarkdownIt from 'markdown-it';
import markdownItFootnote from 'markdown-it-footnote';
import markdownItMark from 'markdown-it-mark';
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
import pageCss from './templates/page.css';
import mdTemplate from './templates/markdown-page.html';
import htmlSnippet from './templates/html-snippet.html';
import { tocJs } from './templates/toc-common';
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
	fullPath: string;
	kind: DocKind;
	page: string;
	bodyHtml?: string;
	/** Directory containing the source file, used to resolve relative static assets (images/embeds/attachments/etc.) */
	rootDir: string;
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

// Disable fuzzy (schemaless) linkification. With it on, a bare token like
// `AGENTS.md` matches linkify-it's fuzzy host rule (`.md` is in its TLD
// list) and gets turned into a dead `http://AGENTS.md/` link. Bare `.md`
// / `.markdown` tokens are re-linked as in-project cross-references instead
// (see `linkifyMdTokens`), so we don't lose the convenience.
md.linkify.set({ fuzzyLink: false });

md.use(markdownItFootnote);
md.use(markdownItMark);

const slugify = (text: string): string =>
	text.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fff\-]/g, '');

/**
 * Rewrite a relative link/src to be relative to `rootDir` instead of the document's
 * own directory. This is what lets `../parent.md` and sibling links resolve correctly
 * once the preview's `<base href>` points at `/preview/<id>/`. Targets that fall inside
 * `rootDir` produce a `..`-free path (so the browser never escapes the `<id>` segment);
 * out-of-scope links keep their `..` and are blocked by resolveStaticPath downstream.
 */
function rewriteLink(href: string, docDir: string, rootDir: string): string {
	if (!rootDir || !docDir) { return href; }
	if (/^(https?:)?\/\//i.test(href) || href.startsWith('#') || href.startsWith('data:') || href.startsWith('mailto:') || href.startsWith('/')) {
		return href;
	}
	const hashIdx = href.indexOf('#');
	const qIdx = href.indexOf('?');
	const cut = qIdx >= 0 && (hashIdx < 0 || qIdx < hashIdx) ? qIdx : hashIdx;
	const raw = cut >= 0 ? href.slice(0, cut) : href;
	if (!raw) { return href; }
	const absTarget = path.resolve(docDir, raw);
	let rel = path.relative(rootDir, absTarget);
	if (path.sep !== '/') { rel = rel.split(path.sep).join('/'); }
	return rel + (cut >= 0 ? href.slice(cut) : '');
}

function rewriteHtmlLinks(html: string, docDir: string, rootDir: string): string {
	if (!rootDir || !docDir) { return html; }
	return html.replace(/(href|src)="([^"]*)"/gi, (_m, attr: string, val: string) => {
		const rewritten = rewriteLink(val, docDir, rootDir);
		return rewritten === val ? _m : `${attr}="${rewritten}"`;
	});
}

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
 * Minimal OnAir-styled picker page for `/xref`. Also embedded client-side in a
 * popover (same HTML, single render source). Lists each matching file with its
 * relative path; rows link to that file's live preview. `files` empty => not found.
 */
	function xrefPage(files: string[], q: string, sourceTitle: string | null, sourcePath: string | null, fragment = false): string {
	const srcRel = sourceTitle && sourcePath ? computeDisplayPath(sourcePath) : null;
	const header = `<h1>${escapeHtml(q)}</h1>` + (srcRel ? `<p class="src">${escapeHtml(srcRel)}</p>` : '');
	const sub = `<p class="sub">${sourceTitle ? `From <strong>${escapeHtml(sourceTitle)}</strong> · ` : ''}sorted by path proximity · click to open its live preview</p>`;
	let body: string;
	if (!files.length) {
		body = `<p class="empty">No matching <code>${escapeHtml(q)}</code> found in this project.</p>`;
	} else {
		const lis = files.map(f => {
			const rel = sourceTitle ? computeDisplayPath(f) : f;
			const uriKey = vscode.Uri.file(f).toString();
			const id = crypto.createHash('sha256').update(uriKey).digest('hex').slice(0, 12);
			return `<li><a class="path" href="/preview/${id}">${escapeHtml(rel)}</a></li>`;
		}).join('');
		body = `<ul>${lis}</ul>`;
	}
	// Fragment mode: just the markup, no <style>. The in-page popover already
	// carries scoped `#xrefOverlay .xref-box …` rules, so a bare fragment won't
	// pollute the host page's CSS (a full <style> with global selectors would).
	if (fragment) { return header + sub + body; }
	const head = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device,initial-scale=1">` +
		`<title>OnAir · ${escapeHtml(q)}</title>` +
		`<style>
			:root{--bg:#fff;--fg:#1f2328;--muted:#57606a;--border:#d0d7de;--accent:#0969da;--pre:#f6f8fa}
			@media (prefers-color-scheme: dark){:root{--bg:#0d1117;--fg:#e6edf3;--muted:#8b949e;--border:#30363d;--accent:#58a6ff;--pre:#161b22}}
			body{font:14px/1.6 system-ui,sans-serif;background:var(--bg);color:var(--fg);margin:0;padding:24px}
			h1{font-size:16px;margin:0}a{color:var(--accent);text-decoration:none}
			a:hover{text-decoration:underline}.sub{color:var(--muted);margin:12px 0;font-size:13px}
			ul{list-style:none;margin:0;padding:0;max-width:680px}
			li{padding:3px 0;border-bottom:1px solid var(--border)}
			li:last-child{border-bottom:none}
			.path{display:block;color:var(--accent);font-size:13px;font-family:ui-monospace,monospace;word-break:break-all}
			.src{color:var(--muted);font-size:12px;font-family:ui-monospace,monospace;margin:2px 0 0;word-break:break-all}
			.empty{color:var(--muted)}
		</style>`;
	return head + header + sub + body;
}

md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
	const inline = tokens[idx + 1];
	if (inline?.type === 'inline') {
		const slugs = (env.slugs ||= new Map<string, boolean>());
		let base = slugify(inline.content);
		if (!base) { base = 'section'; }
		let slug = base, i = 1;
		while (slugs.has(slug)) { slug = `${base}-${i++}`; }
		slugs.set(slug, true);
		tokens[idx].attrSet('id', slug);
	}
	return self.renderToken(tokens, idx, options);
};

md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
	const href = tokens[idx].attrGet('href');
	if (href !== null && env?.docDir && env?.rootDir) {
		const rewritten = rewriteLink(href, env.docDir, env.rootDir);
		if (rewritten !== href) { tokens[idx].attrSet('href', rewritten); }
	}
	return self.renderToken(tokens, idx, options);
};

md.renderer.rules.image = (tokens, idx, options, env, self) => {
	const src = tokens[idx].attrGet('src');
	if (src !== null && env?.docDir && env?.rootDir) {
		const rewritten = rewriteLink(src, env.docDir, env.rootDir);
		if (rewritten !== src) { tokens[idx].attrSet('src', rewritten); }
	}
	return self.renderToken(tokens, idx, options);
};

function renderFrontmatter(source: string): string {
	return source.replace(/^---\n([\s\S]*?)\n---\n?/, (_m, content) =>
		`<div class="frontmatter"><pre>---\n${md.utils.escapeHtml(content)}\n---</pre></div>\n`
	);
}

function renderMarkdown(source: string, docDir: string, rootDir: string, fromId?: string): string {
	return linkifyMdTokens(md.render(renderFrontmatter(source), { docDir, rootDir }), fromId);
}

/**
 * Turn bare `NAME.md` / `NAME.markdown` tokens in already-rendered HTML into
 * in-project cross-reference links. Bare tokens (no `[text](…)` syntax) are not
 * matched by markdown's link rules, and with fuzzy linkify disabled they stay plain
 * text — so we re-link them here as `<a class="onair-xref" href="/xref?…">`.
 *
 * Scoped to `.md`/`.markdown` only. Skips tokens already inside an `<a>` or
 * `<code>`/`<pre>` (the negative lookbehind avoids `href="…"` and `>` from a
 * preceding close tag), so existing links and inline code are untouched.
 */
function linkifyMdTokens(html: string, fromId?: string): string {
	const xref = (name: string): string => {
		const q = encodeURIComponent(name);
		const from = fromId ? `&from=${encodeURIComponent(fromId)}` : '';
		return `<a class="onair-xref" target="_blank" href="/xref?q=${q}${from}">${name}</a>`;
	};
	return html.replace(/(^|[\s<("'])([\w-]*\.(?:markdown|md))(?!\w)(?=$|\s|<)/gi, (_m, pre, name) => {
		if (pre === '>' || pre === '"' || pre === "'" || pre === '.') { return _m; }
		return pre + xref(name);
	});
}

function escapeHtml(s: string): string {
	const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
	return s.replace(/[&<>"']/g, (c) => map[c]);
}

const toPosix = (p: string): string => (path.sep !== '/' ? p.split(path.sep).join('/') : p);

/**
 * Human-friendly path shown under the filename in the TOC. If the file is inside a
 * workspace folder, it's relative to that folder (prefixed with the folder name when
 * several folders are open). Otherwise we walk up to the nearest ancestor containing a
 * `.git` directory and show the path relative to that repo root's parent (so it includes
 * the repo folder name). With neither, falls back to the absolute path.
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

const MIME_TYPES: Record<string, string> = {
	'.html': 'text/html; charset=utf-8',
	'.htm': 'text/html; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.md': 'text/markdown; charset=utf-8',
	'.txt': 'text/plain; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.avif': 'image/avif',
	'.bmp': 'image/bmp',
	'.ico': 'image/x-icon',
	'.pdf': 'application/pdf',
	'.zip': 'application/zip',
	'.mp4': 'video/mp4',
	'.webm': 'video/webm',
	'.mp3': 'audio/mpeg',
	'.wav': 'audio/wav',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.ttf': 'font/ttf',
};

function mimeType(filePath: string): string {
	return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

// Extension version, shown in the preview corner. Injected at build time by
// webpack's DefinePlugin (__ONAIR_VERSION__), with a runtime fallback to the
// VS Code API / on-disk package.json so dev runs still resolve it.
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

/**
 * Resolve a relative request path against a document's root directory, guarding
 * against path traversal (e.g. `../../etc/passwd`). Returns the absolute file
 * path if it's a real file inside rootDir, or null otherwise.
 */
function resolveStaticPath(rootDir: string, relPath: string): string | null {
	const decoded = decodeURIComponent(relPath.split('?')[0].split('#')[0]);
	const resolvedRoot = path.resolve(rootDir);
	const resolvedTarget = path.resolve(resolvedRoot, decoded);
	const isInsideRoot = resolvedTarget === resolvedRoot || resolvedTarget.startsWith(resolvedRoot + path.sep);
	if (!isInsideRoot) { return null; }
	try {
		if (fs.statSync(resolvedTarget).isFile()) { return resolvedTarget; }
	} catch {
		// File doesn't exist or isn't accessible - treat as not found
	}
	return null;
}
function kindFromPath(p: string): DocKind | null {
	const ext = path.extname(p).toLowerCase();
	if (ext === '.md' || ext === '.markdown') { return 'markdown'; }
	if (ext === '.html' || ext === '.htm') { return 'html'; }
	return null;
}

/** Markdown preview page: wrapped in our own template, content updates use targeted DOM replacement (no full page reload) */
function markdownPageTemplate(id: string, title: string, bodyHtml: string, fullPath: string, relPath: string): string {
	return mdTemplate
		.replace(/\{\{CSS\}\}/g, pageCss)
		.replace(/\{\{ID\}\}/g, id)
		.replace(/\{\{TITLE\}\}/g, escapeHtml(title))
		.replace(/\{\{BODY\}\}/g, bodyHtml)
		.replace(/\{\{VERSION\}\}/g, escapeHtml(EXT_VERSION))
		.replace(/\{\{ID_JSON\}\}/g, JSON.stringify(id))
		.replace(/\{\{FULL_PATH_JSON\}\}/g, JSON.stringify(fullPath))
		.replace(/\{\{REL_PATH_JSON\}\}/g, JSON.stringify(relPath))
		.replace(/\{\{TOC_JS\}\}/g, tocJs);
}
/**
 * HTML preview page: the user's HTML is already a complete page (with its own
 * <head>/styles/scripts), so we can't wrap it in our template. Instead we inject
 * a small badge + a reconnect script into its existing content. Content updates
 * trigger a full page reload (location.reload) rather than a targeted replacement,
 * since arbitrary HTML/JS/CSS can't be safely patched via innerHTML.
 */
function htmlLiveReloadSnippet(id: string, title: string, fullPath: string, relPath: string): string {
	return htmlSnippet
		.replace(/\{\{CSS\}\}/g, pageCss)
		.replace(/\{\{ID_JSON\}\}/g, JSON.stringify(id))
		.replace(/\{\{TITLE_JSON\}\}/g, JSON.stringify(title))
		.replace(/\{\{VERSION\}\}/g, escapeHtml(EXT_VERSION))
		.replace(/\{\{FULL_PATH_JSON\}\}/g, JSON.stringify(fullPath))
		.replace(/\{\{REL_PATH_JSON\}\}/g, JSON.stringify(relPath))
		.replace(/\{\{TOC_JS\}\}/g, tocJs);
}

function htmlPageTemplate(id: string, rawHtml: string, title: string, fullPath: string, relPath: string, rootDir: string): string {
	const snippet = htmlLiveReloadSnippet(id, title, fullPath, relPath);
	let withSnippet: string;
	const bodyCloseRegex = /<\/body\s*>/i;
	if (bodyCloseRegex.test(rawHtml)) {
		withSnippet = rawHtml.replace(bodyCloseRegex, snippet + '</body>');
	} else {
		// No </body> found (e.g. it's just an HTML fragment) - append at the end
		withSnippet = rawHtml + snippet;
	}

	// Inject a <base> tag so the user's relative asset references (e.g. <img src="images/x.png">)
	// resolve against /preview/:id/ rather than the bare /preview/:id URL. Skipped if a <base>
	// tag already exists (don't override the user's own choice) or there's no <head> to inject into.
	const headOpenRegex = /<head[^>]*>/i;
	if (!/<base[^>]*>/i.test(withSnippet) && headOpenRegex.test(withSnippet)) {
		withSnippet = withSnippet.replace(headOpenRegex, (tag) => `${tag}\n<base href="/preview/${id}/" />`);
	}

	// Rewrite relative links/src to be root-relative so they resolve via the preview URL
	// (and so `../` links inside the workspace work). Absolute/external links are left alone.
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

	private renderPage(kind: DocKind, id: string, title: string, content: string, fullPath: string, rootDir: string): { page: string; bodyHtml?: string } {
		const relPath = computeDisplayPath(fullPath);
		if (kind === 'html') {
			return { page: htmlPageTemplate(id, content, title, fullPath, relPath, rootDir) };
		}
		const docDir = path.dirname(fullPath);
		const bodyHtml = renderMarkdown(content, docDir, rootDir, id);
		return { page: markdownPageTemplate(id, title, bodyHtml, fullPath, relPath), bodyHtml };
	}
	/** Register/refresh a document, returning its preview id (calling this multiple times for the same file reuses the same id/link) */
	registerDocument(uriKey: string, title: string, content: string, kind: DocKind, rootDir: string, fullPath: string): string {
		let id = this.uriToId.get(uriKey);
		if (!id) {
			// Deterministic id: the same file always yields the same link, so
			// previews survive extension restarts/upgrades and VS Code reloads.
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
			// Keep it around for a few seconds so any open browser tabs can receive the "closed" notice before cleanup
			setTimeout(() => this.docs.delete(id as string), 5000);
		}
		this.uriToId.delete(uriKey);
	}

	buildUrl(id: string): string {
		return `http://127.0.0.1:${this.port}/preview/${id}`;
	}

	/**
	 * Internal debug helper: return the exact full HTML the preview currently
	 * serves for a registered document, prefixed with a marker comment so the
	 * export command can recognize its own files. Output is verbatim (no asset
	 * embedding / link rewriting). Returns null if the document isn't registered.
	 */
	renderHtmlForUri(uriKey: string): string | null {
		const id = this.uriToId.get(uriKey);
		if (!id) { return null; }
		const entry = this.docs.get(id);
		if (!entry) { return null; }
		return `<!-- onair:export:md -->\n${entry.page}`;
	}

	/**
	 * In-project cross-reference resolver. A bare `NAME.md` token in a document is
	 * linked to `/xref?q=NAME.md&from=<id>` (see `linkifyMdTokens`). This
	 * resolves it: walks the source document's rootDir for `.md`/`.markdown` files
	 * whose basename matches, sorts by path proximity to the source, then either
	 * 302-redirects to the single match's preview, or renders a minimal picker
	 * page (also embedded in a popover client-side). The picker and the full-page
	 * navigation share this exact HTML, so the render path is single-source.
	 */
	private handleXref(req: http.IncomingMessage, res: http.ServerResponse, url: string): void {
		const m = url.match(/^\/xref\??([#?].*)?$/);
		if (!m) { return; }
		const params = new URLSearchParams(url.includes('?') ? url.slice(url.indexOf('?') + 1) : '');
		const q = (params.get('q') || '').trim();
		const fromId = params.get('from');
		const fragment = params.get('fragment') === '1';
		const fromEntry = fromId ? this.docs.get(fromId) : undefined;
		const sourcePath = fromEntry?.fullPath;

		res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
		if (!q) {
			res.end(xrefPage([], q, fromEntry?.title ?? null, sourcePath ?? null, fragment));
			return;
		}

		const rootDir = fromEntry?.rootDir || '';
		const matches: string[] = [];
		if (rootDir) {
			const walk = (dir: string): void => {
				let entries: fs.Dirent[];
				try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
				catch { return; }
				for (const e of entries) {
					const full = path.join(dir, e.name);
					if (e.isDirectory()) {
						if (e.name === 'node_modules' || e.name === '.git') { continue; }
						walk(full);
					} else if (e.isFile()) {
						const ext = path.extname(e.name).toLowerCase();
						if ((ext === '.md' || ext === '.markdown') && e.name.toLowerCase() === q.toLowerCase()) {
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
			const id = this.uriToId.get(uriKey) || crypto.createHash('sha256').update(uriKey).digest('hex').slice(0, 12);
			res.writeHead(302, { Location: `/preview/${id}` });
			res.end();
			return;
		}
		res.end(xrefPage(sorted, q, fromEntry?.title ?? null, sourcePath ?? null, fragment));
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

		// Static assets alongside the source file, e.g. /preview/<id>/images/foo.png,
		// referenced via relative paths like `images/foo.png` or `embeds/x.html` in the
		// source document. Checked before the bare preview-page route below.
		const staticMatch = url.match(/^\/preview\/([a-f0-9]+)\/(.+)$/);
		if (staticMatch) {
			const entry = this.docs.get(staticMatch[1]);
			if (!entry) {
				res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
				res.end('Preview not found or has been closed. Please regenerate the link in VS Code.');
				return;
			}
			const rel = staticMatch[2];
			const filePath = resolveStaticPath(entry.rootDir, rel);
			if (!filePath) {
				res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
				res.end('File not found');
				return;
			}

			// A relative link to another Markdown/HTML document: register it on demand
			// (sharing the same id the extension would use) and redirect to its preview,
			// so clicking the link opens a rendered, live-syncable preview instead of raw bytes.
			const kind = kindFromPath(filePath);
			if (kind) {
				const frag = rel.includes('#') ? '#' + rel.split('#')[1] : '';
				const uriKey = vscode.Uri.file(filePath).toString();
				const existingId = this.uriToId.get(uriKey);
				if (existingId) {
					res.writeHead(302, { Location: `/preview/${existingId}${frag}` });
					res.end();
					return;
				}
				fs.readFile(filePath, 'utf8', (err, data) => {
					if (err) {
						res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
						res.end('File not found');
						return;
					}
					const targetWs = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
					const targetRootDir = targetWs ? targetWs.uri.fsPath : path.dirname(filePath);
					const newId = this.registerDocument(uriKey, path.basename(filePath), data, kind, targetRootDir, filePath);
					res.writeHead(302, { Location: `/preview/${newId}${frag}` });
					res.end();
				});
				return;
			}

			fs.readFile(filePath, (err, data) => {
				if (err) {
					res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
					res.end('File not found');
					return;
				}
				res.writeHead(200, { 'Content-Type': mimeType(filePath) });
				res.end(data);
			});
			return;
		}

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

		if (/^\/xref\b/.test(url)) {
			this.handleXref(req, res, url);
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
