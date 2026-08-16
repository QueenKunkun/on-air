import { test } from 'node:test';
import assert from 'node:assert/strict';

let renderMarkdown, escapeHtml, rewriteLink, md;

test('load renderer module', async () => {
	const mod = await import('../src/markdown/renderer.ts');
	renderMarkdown = mod.renderMarkdown;
	escapeHtml = mod.escapeHtml;
	rewriteLink = mod.rewriteLink;
	md = mod.md;
	assert.ok(md, 'md instance loaded');
});

// ─── escapeHtml ─────────────────────────────────────────────────────────────

test('escapeHtml escapes special characters', () => {
	assert.equal(escapeHtml('<b>"a" & \'b\'</b>'), '&lt;b&gt;&quot;a&quot; &amp; &#39;b&#39;&lt;/b&gt;');
});

test('escapeHtml returns plain text unchanged', () => {
	assert.equal(escapeHtml('hello world'), 'hello world');
});

test('escapeHtml handles empty string', () => {
	assert.equal(escapeHtml(''), '');
});

// ─── rewriteLink ────────────────────────────────────────────────────────────

test('rewriteLink rewrites relative path to rootDir', () => {
	const result = rewriteLink('../sibling.md', '/project/docs/sub', '/project');
	assert.equal(result, 'docs/sibling.md');
});

test('rewriteLink leaves absolute URLs untouched', () => {
	assert.equal(rewriteLink('https://example.com', '/a', '/b'), 'https://example.com');
	assert.equal(rewriteLink('http://example.com', '/a', '/b'), 'http://example.com');
});

test('rewriteLink leaves hash-only links untouched', () => {
	assert.equal(rewriteLink('#section', '/a', '/b'), '#section');
});

test('rewriteLink leaves data: links untouched', () => {
	assert.equal(rewriteLink('data:image/png;base64,abc', '/a', '/b'), 'data:image/png;base64,abc');
});

test('rewriteLink returns href unchanged when rootDir is empty', () => {
	assert.equal(rewriteLink('../foo.md', '/doc', ''), '../foo.md');
});

test('rewriteLink returns href unchanged when docDir is empty', () => {
	assert.equal(rewriteLink('../foo.md', '', '/root'), '../foo.md');
});

// ─── md instance ────────────────────────────────────────────────────────────

test('md instance has footnote and mark plugins registered', () => {
	const tokens = md.parse('==marked==', {});
	const hasMark = tokens.some(t => t.type === 'inline' && t.children?.some(c => c.type === 'mark_open'));
	assert.ok(hasMark, 'mark plugin registered');
});

test('md renders basic markdown to HTML', () => {
	const html = md.render('# Hello\n\nParagraph');
	assert.ok(html.includes('<h1'), 'heading rendered');
	assert.ok(html.includes('Hello'), 'heading text present');
	assert.ok(html.includes('<p>Paragraph</p>'), 'paragraph rendered');
});

// ─── renderMarkdown ─────────────────────────────────────────────────────────

test('renderMarkdown renders headings and paragraphs', () => {
	const html = renderMarkdown('# Title\n\nSome text', '/doc', '/root');
	assert.ok(html.includes('<h1'), 'heading tag');
	assert.ok(html.includes('Title'), 'heading text');
	assert.ok(html.includes('Some text'), 'paragraph text');
});

test('renderMarkdown renders frontmatter as div.frontmatter', () => {
	const src = '---\ntitle: Hello\n---\n\nContent';
	const html = renderMarkdown(src, '/doc', '/root');
	assert.ok(html.includes('class="frontmatter"'), 'frontmatter div present');
	assert.ok(html.includes('Content'), 'content after frontmatter');
});

test('renderMarkdown renders code blocks with hljs class', () => {
	const src = '```javascript\nconsole.log("hi");\n```';
	const html = renderMarkdown(src, '/doc', '/root');
	assert.ok(html.includes('class="hljs"'), 'hljs class on code block');
	assert.ok(html.includes('<code>'), 'code tag present');
});

test('renderMarkdown rewrites relative links', () => {
	const src = '[link](../other.md)';
	const html = renderMarkdown(src, '/project/docs', '/project');
	assert.ok(html.includes('other.md'), 'link rewritten');
	assert.ok(!html.includes('../other.md'), 'original relative path removed');
});

test('renderMarkdown does not rewrite external links', () => {
	const src = '[link](https://example.com)';
	const html = renderMarkdown(src, '/doc', '/root');
	assert.ok(html.includes('https://example.com'), 'external link preserved');
});

test('renderMarkdown does not rewrite anchor links', () => {
	const src = '[jump](#section)';
	const html = renderMarkdown(src, '/doc', '/root');
	assert.ok(html.includes('#section'), 'anchor link preserved');
});

test('renderMarkdown renders inline KaTeX math', () => {
	const html = renderMarkdown('能量公式 $E=mc^2$ 在这里', '/doc', '/root');
	assert.ok(html.includes('class="katex"'), 'inline math should render a katex span');
	assert.ok(html.includes('katex-html'), 'inline math should include katex-html');
});

test('renderMarkdown renders block KaTeX math as display', () => {
	const src = '$$\\int_0^1 x^2\\,dx = \\frac{1}{3}$$';
	const html = renderMarkdown(src, '/doc', '/root');
	assert.ok(html.includes('class="katex"'), 'block math should render a katex span');
	assert.ok(html.includes('katex-display'), 'block math should use display mode');
});

test('renderMarkdown keeps bad LaTeX from breaking the document', () => {
	const html = renderMarkdown('正常文本 $E = \\frac{1}{$ 和更多', '/doc', '/root');
	// throwOnError:false → invalid formula rendered inline (katex-error), doc still renders
	assert.ok(html.includes('正常文本'), 'surrounding text still present');
	assert.ok(html.includes('katex-error'), 'invalid formula marked as katex-error, not thrown');
});
