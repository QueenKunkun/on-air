import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const srcPath = join(here, 'toc-common.ts');

// Pull the `tocJs` template-literal body straight out of the source, then
// evaluate it the SAME way the runtime does (a template literal), so regex
// escapes like `\\.` become `\.` exactly as they will in the browser.
function loadTocJs() {
	const src = readFileSync(srcPath, 'utf8');
	const start = src.indexOf('`', src.indexOf('const tocJs'));
	const end = src.indexOf('`;', start);
	assert.ok(start !== -1 && end !== -1, 'could not locate tocJs template literal');
	const raw = src.slice(start + 1, end);
	return new Function('return `' + raw + '`')();
}

// Minimal DOM mock — just enough for buildRelatedLinks.
function makeEl(tag) {
	const el = {
		tagName: tag.toUpperCase(),
		_attrs: {},
		_children: [],
		classList: { _s: new Set(), add(c) { this._s.add(c); }, contains(c) { return this._s.has(c); } },
		setAttribute(k, v) { this._attrs[k] = String(v); },
		getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; },
		appendChild(c) { this._children.push(c); return c; },
		querySelectorAll() { return []; },
		contains() { return false; },
	};
	let _text = '';
	Object.defineProperty(el, 'textContent', { get() { return _text; }, set(v) { _text = (v === null || v === undefined) ? '' : String(v); } });
	return el;
}

function makeAnchor(href, text) {
	const a = makeEl('a');
	a.setAttribute('href', href);
	a.textContent = text;
	return a;
}

function makeDoc(anchors) {
	const doc = makeEl('div');
	doc.querySelectorAll = (sel) => (sel === 'a' ? anchors : []);
	return doc;
}

function runBuildRelatedLinks(toc, root) {
	const tocJs = loadTocJs();
	globalThis.document = { createElement: (t) => makeEl(t) };
	const buildRelatedLinks = new Function(tocJs + '\nreturn buildRelatedLinks;')();
	buildRelatedLinks(toc, root);
}

test('tocJs parses as valid JavaScript (regression guard for regex/escape bugs)', () => {
	assert.doesNotThrow(() => new Function(loadTocJs()), 'tocJs must not throw a SyntaxError');
});

test('buildRelatedLinks keeps only relative .md/.html links, deduped', () => {
	const toc = makeEl('div');
	const doc = makeDoc([
		makeAnchor('./docs/notes.md', 'Notes'),
		makeAnchor('https://example.com', 'External'),
		makeAnchor('#section', 'Anchor'),
		makeAnchor('img.png', 'Image'),
		makeAnchor('../plan.html', 'Plan'),
		makeAnchor('./docs/notes.md#x', 'Notes dup'),
		makeAnchor('mailto:a@b.com', 'Mail'),
		makeAnchor('//cdn.example.com/x.md', 'Protocol-relative'),
	]);

	runBuildRelatedLinks(toc, doc);

	const related = toc._children.find((c) => c.id === 'toc-related');
	assert.ok(related, 'a #toc-related block should be rendered');
	const items = related._children.filter((c) => c.className === 'toc-related-item');
	const labels = items.map((i) => i.textContent);
	const hrefs = items.map((i) => i.href);

	assert.deepEqual(labels, ['Notes', 'Plan'], 'external/anchor/image/mailto/protocol-relative dropped, dup collapsed');
	assert.ok(hrefs.includes('./docs/notes.md'), 'notes.md kept');
	assert.ok(hrefs.includes('../plan.html'), 'plan.html kept');
});

test('buildRelatedLinks is a no-op when nothing qualifies', () => {
	const toc = makeEl('div');
	const doc = makeDoc([
		makeAnchor('https://example.com', 'External'),
		makeAnchor('#s', 'Anchor'),
	]);
	runBuildRelatedLinks(toc, doc);
	assert.equal(toc._children.length, 0, 'nothing appended when no related doc links');
});

test('buildRelatedLinks ignores anchors that live inside the TOC itself', () => {
	const toc = makeEl('div');
	const insideToc = makeAnchor('./internal.md', 'Inside');
	toc._children.push(insideToc);
	// make toc.contains report the anchor as inside
	toc.contains = (node) => node === insideToc;

	const doc = makeDoc([makeAnchor('./docs/notes.md', 'Notes')]);
	runBuildRelatedLinks(toc, doc);

	const related = toc._children.find((c) => c.id === 'toc-related');
	const hrefs = related._children.filter((c) => c.className === 'toc-related-item').map((i) => i.href);
	assert.ok(hrefs.includes('./docs/notes.md'), 'doc link still listed');
	assert.ok(!hrefs.includes('./internal.md'), 'toc-internal link excluded');
});
