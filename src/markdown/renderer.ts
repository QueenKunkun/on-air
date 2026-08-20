import * as fs from 'fs';
import * as path from 'path';
import MarkdownIt from 'markdown-it';
import markdownItFootnote from 'markdown-it-footnote';
import markdownItMark from 'markdown-it-mark';
import hljs from 'highlight.js/lib/core';
import { MARKDOWN_EXTS } from '../common/extensions';
import sanitizeUnknownHtml from './sanitize-unknown-html';
import citationsPlugin from './citations';
import markdownItKatex from '@vscode/markdown-it-katex';

// Language imports — only the subset we want to highlight.
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

function highlightCode(code: string, lang: string): string {
	if (lang && hljs.getLanguage(lang)) {
		try {
			return hljs.highlight(code, { language: lang }).value;
		} catch {
			// Fall back to plain text if highlighting fails
		}
	}
	return md.utils.escapeHtml(code);
}

export const md: MarkdownIt = new MarkdownIt({
	html: true,
	linkify: true,
	typographer: true,
	highlight: (code, lang) => {
		if (lang === 'mermaid') {
			// Mermaid diagrams: kept as raw source in a <pre class="mermaid"> that the
			// frontend renders client-side (lazy CDN load). Falls back to plain text
			// when the library can't be fetched (offline).
			return `<pre class="mermaid">${md.utils.escapeHtml(code)}</pre>`;
		}
		return `<pre class="hljs"><code>${highlightCode(code, lang)}</code></pre>`;
	},
});

// Disable fuzzy (schemaless) linkification to prevent bare tokens like
// `AGENTS.md` from being turned into dead `http://AGENTS.md/` links.
md.linkify.set({ fuzzyLink: false });

md.use(markdownItFootnote);
md.use(markdownItMark);
md.use(sanitizeUnknownHtml);
// KaTeX math: $..$ inline, $$..$$ block. throwOnError:false keeps a bad
// formula from breaking the whole document render (shows raw LaTeX in red).
md.use(markdownItKatex, { throwOnError: false });
// IEEE numeric citations: [3], [2, 7], [8-10] → links to the reference entries.
md.use(citationsPlugin);

const slugify = (text: string): string =>
	text.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fff\-]/g, '');

/**
 * Rewrite a relative <a> navigation link against the workspace root (`rootDir`).
 * The server resolves direct navigations against rootDir (see the fallback in
 * server.ts), and rootDir-relative paths never contain `..` for targets inside
 * the workspace, so they don't escape `/preview/<id>/`.
 */
export function rewriteLink(href: string, docDir: string, rootDir: string): string {
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
	return path.relative(rootDir, absTarget).split(path.sep).join('/') + (cut >= 0 ? href.slice(cut) : '');
}

/**
 * Rewrite a relative src/href for an EMBEDDED asset (image, iframe, HTML
 * sub-resource) against the document's own directory (`docDir`). The server
 * resolves embedded sub-resources against `docDir` (the directory of the
 * referencing file), so they must be docDir-relative. This is what makes a
 * sibling `images/` folder resolve correctly even when the document is opened
 * outside any workspace or in a different project than `rootDir`.
 */
export function rewriteLinkDocRelative(href: string, docDir: string): string {
	if (!docDir) { return href; }
	if (/^(https?:)?\/\//i.test(href) || href.startsWith('#') || href.startsWith('data:') || href.startsWith('mailto:') || href.startsWith('/')) {
		return href;
	}
	const hashIdx = href.indexOf('#');
	const qIdx = href.indexOf('?');
	const cut = qIdx >= 0 && (hashIdx < 0 || qIdx < hashIdx) ? qIdx : hashIdx;
	const raw = cut >= 0 ? href.slice(0, cut) : href;
	if (!raw) { return href; }
	const absTarget = path.resolve(docDir, raw);
	let rel = path.relative(docDir, absTarget);
	if (path.sep !== '/') { rel = rel.split(path.sep).join('/'); }
	return rel + (cut >= 0 ? href.slice(cut) : '');
}

function rewriteHtmlLinks(html: string, docDir: string, rootDir: string): string {
	if (!rootDir || !docDir) { return html; }
	return html.replace(/(href|src)="([^"]*)"/gi, (_m, attr: string, val: string) => {
		const rewritten = rewriteLinkDocRelative(val, docDir);
		return rewritten === val ? _m : `${attr}="${rewritten}"`;
	});
}

function renderFrontmatter(source: string): string {
	return source.replace(/^---\n([\s\S]*?)\n---\n?/, (_m, content) =>
		`<div class="frontmatter"><pre>---\n${md.utils.escapeHtml(content)}\n---</pre></div>\n`
	);
}

/**
 * Turn bare `NAME.md` / `NAME.markdown` / `NAME.mdx` tokens in already-rendered HTML
 * into in-project cross-reference links.
 */
const MD_LINKIFY_RE = new RegExp(`(^|[\\s<("'])([\\w-]*\\.(?:${MARKDOWN_EXTS.map(e => e.slice(1)).join('|')}))(?!\\w)(?=$|\\s|<)`, 'gi');
function linkifyMdTokens(html: string, fromId?: string): string {
	const xref = (name: string): string => {
		const q = encodeURIComponent(name);
		const from = fromId ? `&from=${encodeURIComponent(fromId)}` : '';
		return `<a class="onair-xref" target="_blank" href="/xref?q=${q}${from}">${name}</a>`;
	};
	MD_LINKIFY_RE.lastIndex = 0;
	return html.replace(MD_LINKIFY_RE, (_m, pre, name) => {
		if (pre === '>' || pre === '"' || pre === "'" || pre === '.') { return _m; }
		return pre + xref(name);
	});
}

export function escapeHtml(s: string): string {
	const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
	return s.replace(/[&<>"']/g, (c) => map[c]);
}

// Heading slug deduplication
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

// Link rewriting
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
	const href = tokens[idx].attrGet('href');
	if (href !== null && env?.docDir && env?.rootDir) {
		const rewritten = rewriteLink(href, env.docDir, env.rootDir);
		if (rewritten !== href) { tokens[idx].attrSet('href', rewritten); }
	}
	return self.renderToken(tokens, idx, options);
};

// Image rewriting — embedded assets resolve against docDir, so rewrite relative
// to the document directory (not the workspace root).
md.renderer.rules.image = (tokens, idx, options, env, self) => {
	const src = tokens[idx].attrGet('src');
	if (src !== null && env?.docDir) {
		const rewritten = rewriteLinkDocRelative(src, env.docDir);
		if (rewritten !== src) { tokens[idx].attrSet('src', rewritten); }
	}
	return self.renderToken(tokens, idx, options);
};

/** Render Markdown source to HTML with link rewriting and xref linkification. */
export function renderMarkdown(source: string, docDir: string, rootDir: string, fromId?: string, opts?: { citeStyle?: 'link' | 'footnotes' }): string {
	const env = { docDir, rootDir, citeStyle: opts?.citeStyle ?? 'link' };
	return linkifyMdTokens(md.render(renderFrontmatter(source), env), fromId);
}

/** Rewrite relative links in raw HTML (used by html-snippet path). */
export { rewriteHtmlLinks };
