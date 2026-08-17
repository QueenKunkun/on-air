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

// ─── IEEE numeric citations ────────────────────────────────────────────────

const REFS_DOC = (body) => `${body}\n\n## References\n\n[2] Ref two.\n\n[3] Ref three.\n\n[7] Ref seven.\n\n[8] Ref eight.\n\n[9] Ref nine.\n\n[10] Ref ten.`;

test('citations: single [N] becomes a link to the reference entry', () => {
	const html = renderMarkdown(REFS_DOC('See [3].'), '/doc', '/root');
	assert.ok(html.includes('<a href="#ref-3"'), 'single citation linked');
	assert.ok(html.includes('class="onair-citation"'), 'citation link has class');
});

test('citations: multi [N, M] links each number', () => {
	const html = renderMarkdown(REFS_DOC('See [2, 7].'), '/doc', '/root');
	assert.ok(html.includes('<a href="#ref-2"'), 'first number linked');
	assert.ok(html.includes('<a href="#ref-7"'), 'second number linked');
	assert.ok(html.includes(', '), 'separator preserved');
});

test('citations: range [N-M] links endpoints', () => {
	const html = renderMarkdown(REFS_DOC('See [8-10].'), '/doc', '/root');
	assert.ok(html.includes('<a href="#ref-8"'), 'range start linked');
	assert.ok(html.includes('<a href="#ref-10"'), 'range end linked');
});

test('citations: undefined numbers are left untouched', () => {
	const html = renderMarkdown(REFS_DOC('Interval [0, 1] and [99] are not citations.'), '/doc', '/root');
	assert.ok(!html.includes('href="#ref-0"'), '0 not a citation');
	assert.ok(!html.includes('href="#ref-1"'), '1 not a citation');
	assert.ok(!html.includes('href="#ref-99"'), '99 not a citation');
	assert.ok(html.includes('[0, 1]'), 'interval text preserved');
	assert.ok(html.includes('[99]'), 'unknown ref text preserved');
});

test('citations: reference entries get ref-N anchor ids', () => {
	const html = renderMarkdown(REFS_DOC('See [3].'), '/doc', '/root');
	assert.ok(html.includes('id="ref-3"'), 'entry has ref-3 anchor');
	assert.ok(html.includes('id="ref-2"'), 'entry has ref-2 anchor');
	assert.ok(html.includes('id="ref-10"'), 'entry has ref-10 anchor');
});

test('citations: no References section means no citation linking', () => {
	const html = renderMarkdown('Just [3] with no reference list.', '/doc', '/root');
	assert.ok(!html.includes('href="#ref-3"'), 'no refs section → no links');
	assert.ok(html.includes('[3]'), 'citation text preserved');
});

test('citations: footnote-style [^N] refs stay as footnotes', () => {
	const html = renderMarkdown('A[^1] B.\n\n## References\n\n[^1]: Footnote ref.', '/doc', '/root');
	assert.ok(html.includes('class="footnote-ref"'), 'footnote ref rendered');
	assert.ok(!html.includes('class="onair-citation"'), 'no citation link for footnote ref');
});

test('citations: citations inside math are not linked', () => {
	const html = renderMarkdown(REFS_DOC('Math $[0,1]$ here[3].'), '/doc', '/root');
	assert.ok(html.includes('class="katex"'), 'math rendered');
	assert.ok(html.includes('href="#ref-3"'), 'citation outside math linked');
	assert.ok(!html.includes('href="#ref-0"'), 'number inside math not linked');
});

// ─── IEEE citations → footnotes mode ─────────────────────────────────────────

const FOOTNOTES = { citeStyle: 'footnotes' };

test('footnotes mode: [N] becomes a footnote-ref', () => {
	const html = renderMarkdown(REFS_DOC('See [3].'), '/doc', '/root', undefined, FOOTNOTES);
	assert.ok(html.includes('class="footnote-ref"'), 'citation rendered as footnote ref');
	assert.ok(!html.includes('class="onair-citation"'), 'no citation link in footnotes mode');
});

test('footnotes mode: footnote items render with reference text', () => {
	const html = renderMarkdown(REFS_DOC('See [3].'), '/doc', '/root', undefined, FOOTNOTES);
	assert.ok(html.includes('Ref three.'), 'reference entry text present as footnote body');
	assert.ok(html.includes('footnote-item'), 'footnote item rendered');
});

test('footnotes mode: multi [N, M] renders one footnote-ref per number', () => {
	const html = renderMarkdown(REFS_DOC('See [2, 7].'), '/doc', '/root', undefined, FOOTNOTES);
	const refs = html.match(/class="footnote-ref"/g) || [];
	assert.equal(refs.length, 2, 'two footnote refs for two numbers');
	assert.ok(html.includes('Ref two.'), 'ref 2 body present');
	assert.ok(html.includes('Ref seven.'), 'ref 7 body present');
});

test('footnotes mode: range [N-M] renders a ref per endpoint', () => {
	const html = renderMarkdown(REFS_DOC('See [8-10].'), '/doc', '/root', undefined, FOOTNOTES);
	const refs = html.match(/class="footnote-ref"/g) || [];
	assert.equal(refs.length, 3, 'three footnote refs for a 3-number range');
	assert.ok(html.includes('Ref ten.'), 'range end body present');
});

test('footnotes mode: undefined numbers are left as text', () => {
	const html = renderMarkdown(REFS_DOC('Interval [0, 1] and [99].'), '/doc', '/root', undefined, FOOTNOTES);
	assert.ok(!html.includes('footnote-ref'), 'no footnote refs');
	assert.ok(html.includes('[0, 1]'), 'interval text preserved');
	assert.ok(html.includes('[99]'), 'unknown ref text preserved');
});

test('footnotes mode: existing [^N] footnote defs are preserved', () => {
	const html = renderMarkdown('A[^1] and [3].\n\n## References\n\n[^1]: Footnote one.\n\n[2] Ref two.\n\n[3] Ref three.', '/doc', '/root', undefined, FOOTNOTES);
	assert.ok(html.includes('Footnote one.'), 'existing footnote body preserved');
	assert.ok(html.includes('Ref three.'), 'converted ref body present');
});

test('footnotes mode: pure-citation math like $[3],$ is unwrapped and converted', () => {
	const html = renderMarkdown(REFS_DOC('Math $[8-10],$ here.'), '/doc', '/root', undefined, FOOTNOTES);
	assert.ok(!html.includes('katex'), 'pure-citation math not rendered as katex');
	const refs = html.match(/class="footnote-ref"/g) || [];
	assert.equal(refs.length, 3, 'math-wrapped citations converted to footnote refs');
	assert.ok(html.includes('Ref ten.'), 'range end body present');
});

test('footnotes mode: genuine math keeps citations unlinked', () => {
	const html = renderMarkdown(REFS_DOC('Math $x[3] \\to y$ and [7].'), '/doc', '/root', undefined, FOOTNOTES);
	assert.ok(html.includes('class="katex"'), 'genuine math still rendered');
	assert.ok(!html.includes('href="#ref-3"'), 'citation inside math not converted');
	assert.ok(html.includes('Ref seven.'), 'citation outside math converted');
});

test('footnotes mode: code fences and inline code are skipped', () => {
	const src = '```\nconst a = [3];\n```\n\n`inline [7] code`\n\nSee [3].\n\n## References\n\n[2] Ref two.\n\n[3] Ref three.\n\n[7] Ref seven.';
	const html = renderMarkdown(src, '/doc', '/root', undefined, FOOTNOTES);
	assert.ok(html.includes('const a = [3];'), 'code fence content unchanged');
	assert.ok(html.includes('inline [7] code'), 'inline code unchanged');
	const refs = html.match(/class="footnote-ref"/g) || [];
	assert.equal(refs.length, 1, 'only real citation converted');
});

test('footnotes mode: no References section leaves source untouched', () => {
	const html = renderMarkdown('Just [3] with no list.', '/doc', '/root', undefined, FOOTNOTES);
	assert.ok(html.includes('[3]'), 'citation text preserved');
	assert.ok(!html.includes('footnote-ref'), 'no footnote refs without References section');
});

test('footnotes mode: link mode is unchanged when citeStyle is default', () => {
	const html = renderMarkdown(REFS_DOC('See [3].'), '/doc', '/root');
	assert.ok(html.includes('class="onair-citation"'), 'default stays link mode');
	assert.ok(!html.includes('class="footnote-ref"'), 'no footnote refs in link mode');
});
