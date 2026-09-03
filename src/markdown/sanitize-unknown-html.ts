import type MarkdownIt from 'markdown-it';

/**
 * Whitelist of HTML tags that markdown-it should render as-is.
 * Everything else gets wrapped in a collapsible <details> block.
 */
const ALLOWED_TAGS = new Set([
	'div', 'p', 'span', 'a', 'img', 'strong', 'em', 'b', 'i', 'u', 's', 'del', 'ins',
	'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
	'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
	'hr', 'br', 'figure', 'figcaption', 'video', 'audio', 'source', 'iframe', 'embed', 'object',
	'svg', 'math', 'canvas', 'template',
	'section', 'article', 'aside', 'header', 'footer', 'nav', 'main', 'details', 'summary',
	'mark', 'sup', 'sub', 'small', 'abbr', 'cite', 'dfn', 'kbd', 'samp', 'var',
]);

function isAllowed(tag: string): boolean {
	return ALLOWED_TAGS.has(tag.toLowerCase());
}

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function getTagName(content: string): string | null {
	const m = content.match(/^<\/?([a-zA-Z][a-zA-Z0-9_]*)/);
	return m ? m[1] : null;
}

function makeDetails(label: string, body: string): string {
	return `<details class="onair-unknown-html"><summary>${escapeHtml(label)}</summary>\n\n` +
		`<pre><code>${escapeHtml(body)}</code></pre>\n\n</details>`;
}

function makeDetailsEmpty(label: string): string {
	return `<details class="onair-unknown-html"><summary>${escapeHtml(label)}</summary>\n\n</details>`;
}

/**
 * Core rule: wrap non-standard HTML in collapsible <details>.
 * Runs after text_join — code_inline tokens are already separated,
 * so tags inside backticks are never touched.
 */
function sanitizeCore(state: { tokens: Array<{ type: string; content: string; children?: Array<{ type: string; content: string }> | null }> }): void {
	const tokens = state.tokens;

	for (let j = 0; j < tokens.length; j++) {
		// ── html_block ────────────────────────────────────────────────
		if (tokens[j].type === 'html_block') {
			const tag = getTagName(tokens[j].content);
			if (tag && !isAllowed(tag)) {
				tokens[j].content = makeDetails('<' + tag + '>', tokens[j].content);
			}
			continue;
		}

		// ── inline children ───────────────────────────────────────────
		if (tokens[j].type !== 'inline') continue;
		const children = tokens[j].children;
		if (!children) continue;

		for (let i = 0; i < children.length; i++) {
			if (children[i].type !== 'html_inline') continue;

			const content = children[i].content;
			const tag = getTagName(content);
			if (!tag || isAllowed(tag)) continue;

			const isClosing = content.startsWith('</');
			const isSelfClose = content.endsWith('/>');

			// ── self-closing: <Component /> ────────────────────────────
			if (isSelfClose) {
				// Modify in place — just change the content
				children[i].content = makeDetailsEmpty('<' + tag + '/>');
				continue;
			}

			// ── closing tag: skip (handled with its opening) ─────────
			if (isClosing) continue;

			// ── opening tag: look for matching closing tag ────────────
			let depth = 1;
			let endIdx = -1;
			for (let k = i + 1; k < children.length; k++) {
				if (children[k].type !== 'html_inline') continue;
				const c = children[k].content;
				const cn = getTagName(c);
				if (cn !== tag) continue;
				if (c.startsWith('</')) {
					depth--;
					if (depth === 0) { endIdx = k; break; }
				} else if (!c.endsWith('/>')) {
					depth++;
				}
			}

			if (endIdx === -1) {
				// No matching close — wrap just the opening tag
				children[i].content = makeDetailsEmpty('<' + tag + '>');
				continue;
			}

			// Found matching close — collect all inner content as raw HTML
			const innerParts: string[] = [];
			for (let k = i + 1; k < endIdx; k++) {
				const ch = children[k];
				if (ch.type === 'text' || ch.type === 'html_inline') {
					innerParts.push(ch.content);
				} else if (ch.type === 'code_inline') {
					innerParts.push('`' + ch.content + '`');
				} else {
					innerParts.push(ch.content || '');
				}
			}

			const openTag = children[i].content;
			const closeTag = children[endIdx].content;
			const inner = innerParts.join('').trim();

			// Replace opening tag with the full details block
			children[i].content = makeDetails(
				'<' + tag + '>',
				openTag + '\n' + inner + '\n' + closeTag
			);

			// Remove inner tokens and closing tag (they're now inside the details)
			if (endIdx > i + 1) {
				children.splice(i + 1, endIdx - i);
			}
		}
	}
}

/**
 * markdown-it plugin: wraps non-standard HTML tags in collapsible <details> blocks.
 * Uses a core rule on the token stream — no string preprocessing needed.
 */
export default function sanitizeUnknownHtmlPlugin(md: MarkdownIt): void {
	md.core.ruler.after('text_join', 'sanitize_unknown_html', sanitizeCore);
}
