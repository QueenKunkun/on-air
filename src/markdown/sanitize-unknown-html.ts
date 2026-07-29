import type MarkdownIt from 'markdown-it';

/**
 * Whitelist of HTML tags that markdown-it should render as-is.
 * Everything else gets escaped in preprocessing.
 */
const ALLOWED_TAGS = new Set([
	// Standard HTML block elements
	'div', 'p', 'span', 'a', 'img', 'strong', 'em', 'b', 'i', 'u', 's', 'del', 'ins',
	'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
	'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
	'hr', 'br', 'figure', 'figcaption', 'video', 'audio', 'source', 'iframe', 'embed', 'object',
	'svg', 'math', 'canvas', 'template',
	// Semantic elements
	'section', 'article', 'aside', 'header', 'footer', 'nav', 'main', 'details', 'summary',
	// Markdown-it common
	'mark', 'sup', 'sub', 'small', 'abbr', 'cite', 'dfn', 'kbd', 'samp', 'var',
]);

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Check if a tag is allowed (should be rendered as-is).
 */
function isAllowed(tag: string): boolean {
	return ALLOWED_TAGS.has(tag.toLowerCase());
}

/**
 * Preprocess markdown source to sanitize unknown HTML tags.
 * Unknown tags are wrapped in collapsible <details> blocks.
 */
export function sanitizeUnknownHtml(source: string): string {
	// Process line by line to handle multi-line tags
	const lines = source.split('\n');
	const result: string[] = [];

	let i = 0;
	while (i < lines.length) {
		const line = lines[i];

		// Check for opening tags of unknown elements
		const openMatch = line.match(/^<([a-zA-Z][a-zA-Z0-9_]*)[^>]*>$/);
		if (openMatch && !isAllowed(openMatch[1])) {
			const tagName = openMatch[1];
			const content: string[] = [];

			// Collect content until closing tag
			i++;
			while (i < lines.length) {
				const closeMatch = lines[i].match(new RegExp(`^</${tagName}\\s*>$`, 'i'));
				if (closeMatch) {
					break;
				}
				content.push(lines[i]);
				i++;
			}

			// Wrap in details block
			const label = `<${tagName}>`;
			const escapedContent = escapeHtml(content.join('\n').trim());
			result.push('');
			result.push(`<details class="onair-unknown-html"><summary>${escapeHtml(label)}</summary>`);
			result.push('');
			result.push(`<pre><code>${escapedContent}</code></pre>`);
			result.push('');
			result.push('</details>');
			result.push('');
			i++;
			continue;
		}

		// Check for self-closing unknown tags
		const selfCloseMatch = line.match(/^<([a-zA-Z][a-zA-Z0-9_]*)[^>]*\/>$/);
		if (selfCloseMatch && !isAllowed(selfCloseMatch[1])) {
			const tagName = selfCloseMatch[1];
			const label = `<${tagName}/>`;
			result.push('');
			result.push(`<details class="onair-unknown-html"><summary>${escapeHtml(label)}</summary>`);
			result.push('');
			result.push('</details>');
			result.push('');
			i++;
			continue;
		}

		// Check for inline unknown tags
		const inlineTagRe = /<([a-zA-Z][a-zA-Z0-9_]*)[^>]*>/g;
		let match;
		let hasUnknownTag = false;
		while ((match = inlineTagRe.exec(line)) !== null) {
			if (!isAllowed(match[1])) {
				hasUnknownTag = true;
				break;
			}
		}

		if (hasUnknownTag) {
			// Process the line to replace unknown tags
			const processed = line.replace(/<([a-zA-Z][a-zA-Z0-9_]*)[^>]*>([\s\S]*?)<\/\1\s*>/g, (m, tagName, inner) => {
				if (isAllowed(tagName)) {
					return m;
				}
				const label = `<${tagName}>`;
				return `<details class="onair-unknown-html"><summary>${escapeHtml(label)}</summary>\n\n${escapeHtml(inner.trim())}\n\n</details>`;
			});

			// Also handle self-closing tags
			const finalProcessed = processed.replace(/<([a-zA-Z][a-zA-Z0-9_]*)[^>]*\/>/g, (m, tagName) => {
				if (isAllowed(tagName)) {
					return m;
				}
				const label = `<${tagName}/>`;
				return `<details class="onair-unknown-html"><summary>${escapeHtml(label)}</summary>\n\n</details>`;
			});

			result.push(finalProcessed);
			i++;
			continue;
		}

		// No unknown tags, keep line as-is
		result.push(line);
		i++;
	}

	return result.join('\n');
}

/**
 * markdown-it plugin that wraps non-standard HTML tags in collapsible <details> blocks.
 */
function sanitizeUnknownHtmlPlugin(md: MarkdownIt): void {
	// Store original render method
	const originalRender = md.render.bind(md);

	// Override render to preprocess source
	md.render = (src: string, env?: Record<string, unknown>): string => {
		const sanitized = sanitizeUnknownHtml(src);
		return originalRender(sanitized, env);
	};
}

export default sanitizeUnknownHtmlPlugin;
