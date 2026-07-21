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
		style: {},
		dataset: {},
		classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); }, toggle(c, force) { if (force === undefined) { if (this._s.has(c)) this._s.delete(c); else this._s.add(c); } else if (force) this._s.add(c); else this._s.delete(c); } },
		setAttribute(k, v) { this._attrs[k] = String(v); },
		getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; },
		appendChild(c) { this._children.push(c); return c; },
		querySelectorAll() { return []; },
		querySelector(sel) {
			if (sel[0] !== '.') { return null; }
			const cls = sel.slice(1);
			return el._children.find((c) => (c.className || '').split(' ').includes(cls)) || null;
		},
		contains() { return false; },
		get offsetHeight() { return 0; },
		get offsetWidth() { return 0; },
		get children() { return this._children; },
	};
	let _text = '';
	Object.defineProperty(el, 'textContent', { get() { return _text; }, set(v) { _text = (v === null || v === undefined) ? '' : String(v); } });
	return el;
}

function makeDocument() {
	const handlers = {};
	return {
		createElement: (t) => makeEl(t),
		addEventListener: (type, fn) => { (handlers[type] = handlers[type] || []).push(fn); },
		removeEventListener: (type, fn) => { if (handlers[type]) { handlers[type] = handlers[type].filter((f) => f !== fn); } },
		dispatch: (type, ev) => { (handlers[type] || []).slice().forEach((f) => f(ev)); },
	};
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

function runBuildRelatedLinks(toc, root, storage) {
	const tocJs = loadTocJs();
	globalThis.document = makeDocument();
	globalThis.localStorage = storage || { _s: {}, getItem(k) { return k in this._s ? this._s[k] : null; }, setItem(k, v) { this._s[k] = String(v); } };
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

test('attachResizer: related-height drag changes size, clamps, and persists', () => {
	const doc = makeDocument();
	globalThis.document = doc;
	const storage = { _s: {}, getItem(k) { return k in this._s ? this._s[k] : null; }, setItem(k, v) { this._s[k] = String(v); } };
	globalThis.localStorage = storage;

	const tocJs = loadTocJs();
	const attachResizer = new Function(tocJs + '\nreturn attachResizer;')();

	const target = makeEl('div');
	Object.defineProperty(target, 'offsetHeight', { get() { return parseInt(target.style.height, 10) || 0; } });
	const resizer = makeEl('div');

	attachResizer(resizer, target, {
		axis: 'y', invert: true, key: 'onair-related-height', def: 200, min: 120, max: 480,
		get: (el) => el.offsetHeight,
		set: (el, v) => { el.style.height = v + 'px'; },
	});

	assert.equal(target.style.height, '200px', 'default height applied when nothing saved');

	resizer.onmousedown({ clientY: 300, preventDefault() {} });
	doc.dispatch('mousemove', { clientY: 200 });
	doc.dispatch('mouseup', {});
	assert.equal(target.style.height, '300px', 'dragging up grows height');
	assert.equal(storage.getItem('onair-related-height'), '300', 'height persisted');

	resizer.onmousedown({ clientY: 300, preventDefault() {} });
	doc.dispatch('mousemove', { clientY: -10000 });
	doc.dispatch('mouseup', {});
	assert.equal(target.style.height, '480px', 'height clamped to MAX');
});

test('attachResizer: width resizer leaves CSS default alone when nothing saved', () => {
	const doc = makeDocument();
	globalThis.document = doc;
	globalThis.localStorage = { _s: {}, getItem() { return null; }, setItem() {} };

	const tocJs = loadTocJs();
	const attachResizer = new Function(tocJs + '\nreturn attachResizer;')();

	const target = makeEl('div');
	target.style.width = '300px';
	Object.defineProperty(target, 'offsetWidth', { get() { return parseInt(target.style.width, 10) || 0; } });
	const resizer = makeEl('div');

	attachResizer(resizer, target, {
		axis: 'x', invert: false, key: 'onair-toc-width', def: null, min: 180, max: 600,
		get: (el) => el.offsetWidth,
		set: (el, v) => { el.style.width = v + 'px'; },
	});

	assert.equal(target.style.width, '300px', 'width not forced when nothing saved (CSS controls it)');

	resizer.onmousedown({ clientX: 300, preventDefault() {} });
	doc.dispatch('mousemove', { clientX: 400 });
	doc.dispatch('mouseup', {});
	assert.equal(target.style.width, '400px', 'dragging right grows width');

	resizer.onmousedown({ clientX: 300, preventDefault() {} });
	doc.dispatch('mousemove', { clientX: 100000 });
	doc.dispatch('mouseup', {});
	assert.equal(target.style.width, '600px', 'clamped to MAX 600');
});

test('page.css defines the Related/TOC resizer rule', () => {
	const css = readFileSync(join(here, 'page.css'), 'utf8');
	assert.ok(/\.toc-related-resizer\s*\{/.test(css), 'page.css must style .toc-related-resizer');
});

// ---- file tree tests ----

function loadFileTreeFunctions() {
	const htmlPath = join(here, 'markdown-page.html');
	const html = readFileSync(htmlPath, 'utf8');
	const marker = '// ---- file tree: tab switching, tree navigation, file opening ----';
	const treeStart = html.indexOf(marker);
	assert.ok(treeStart !== -1, 'could not locate file tree marker');
	const tryStart = html.indexOf('try {', treeStart);
	const tryEnd = html.indexOf("} catch (e) { console.error('file tree error', e); }", treeStart);
	assert.ok(tryStart !== -1 && tryEnd !== -1, 'could not locate file tree IIFE');
	let body = html.slice(tryStart + 5, tryEnd);

	// Strip IIFE wrapper: remove (function () { … })();
	body = body.replace(/^\s*\(function\s*\(\s*\)\s*\{/, '');
	body = body.replace(/\}\s*\)\s*\(\s*\)\s*;\s*$/, '');

	// Provide minimal globals
	globalThis.document = {
		getElementById(id) {
			var el = makeEl('div');
			el.checked = true;
			return el;
		},
		createElement: (tag) => makeEl(tag),
	};
	globalThis.localStorage = {
		_s: {}, getItem(k) { return k in this._s ? this._s[k] : null; }, setItem(k, v) { this._s[k] = String(v); }, removeItem(k) { delete this._s[k]; },
	};
	globalThis.window = globalThis;

	const ft = {};
	const code = body + '\n' +
		'ft.renderDirContent = renderDirContent;\n' +
		'ft.saveExpandedState = saveExpandedState;\n' +
		'ft.clearAllCache = clearAllCache;\n' +
		'ft.ftExpanded = ftExpanded;\n' +
		'ft.ftCache = ftCache;\n';
	new Function('ft', code)(ft);
	return ft;
}

test('file tree: renderDirContent creates nested tree DOM', () => {
	const ft = loadFileTreeFunctions();

	const data = {
		dir: 'root',
		entries: [
			{ type: 'directory', name: 'app', path: 'app' },
			{ type: 'file', name: 'index.ts', path: 'index.ts' },
			{ type: 'directory', name: 'lib', path: 'lib' },
			{ type: 'file', name: 'readme.md', path: 'readme.md' },
		],
	};

	const container = makeEl('ul');
	ft.renderDirContent(data, container);

	assert.equal(container.children.length, 4, 'all 4 entries rendered');

	// Directories come first (sorted), then files (sorted)
	assert.equal(container.children[0].className, 'ft-item ft-directory');
	assert.equal(container.children[0].querySelector('.ft-name').textContent, 'app');
	assert.ok(container.children[0].querySelector('.ft-toggle'), 'dir has toggle');
	assert.equal(container.children[0].querySelector('.ft-toggle').textContent, '\u25B6', 'dir toggle starts collapsed');
	assert.ok(container.children[0].querySelector('.ft-children'), 'dir has children container');
	assert.equal(container.children[0].querySelector('.ft-children').children.length, 0, 'children empty initially');

	assert.equal(container.children[1].className, 'ft-item ft-directory');
	assert.equal(container.children[1].querySelector('.ft-name').textContent, 'lib');

	assert.equal(container.children[2].className, 'ft-item ft-file');
	assert.equal(container.children[2].querySelector('.ft-name').textContent, 'index.ts');
	assert.ok(container.children[2].querySelector('.ft-vis-hidden'), 'file has spacer toggle');

	assert.equal(container.children[3].className, 'ft-item ft-file');
	assert.equal(container.children[3].querySelector('.ft-name').textContent, 'readme.md');
});

test('file tree: renderDirContent with empty entries', () => {
	const ft = loadFileTreeFunctions();
	const container = makeEl('ul');
	ft.renderDirContent({ dir: 'empty', entries: [] }, container);
	assert.equal(container.children.length, 0, 'empty entries yields no children');
});

test('file tree: clearAllCache empties cache', () => {
	const ft = loadFileTreeFunctions();
	ft.ftCache['src'] = { dir: 'src', entries: [] };
	ft.ftCache['src/app'] = { dir: 'src/app', entries: [] };
	ft.clearAllCache();
	assert.deepEqual(ft.ftCache, {}, 'cache cleared');
});

test('file tree: saveExpandedState persists paths to localStorage', () => {
	const ft = loadFileTreeFunctions();

	const storage = {
		_s: {},
		getItem(k) { return k in this._s ? this._s[k] : null; },
		setItem(k, v) { this._s[k] = String(v); },
		removeItem(k) { delete this._s[k]; },
	};
	globalThis.localStorage = storage;

	// No expanded paths → remove key
	ft.saveExpandedState();
	assert.equal(storage.getItem('onair-ft-expanded'), null, 'empty state removes key');

	// Set some expanded paths
	ft.ftExpanded['src'] = true;
	ft.ftExpanded['src/components'] = true;
	ft.saveExpandedState();

	const saved = JSON.parse(storage.getItem('onair-ft-expanded'));
	assert.ok(Array.isArray(saved), 'saved value is an array');
	assert.equal(saved.length, 2, 'two paths saved');
	assert.ok(saved.includes('src'), 'src in saved paths');
	assert.ok(saved.includes('src/components'), 'src/components in saved paths');

	// Clear expanded and verify removeItem called
	delete ft.ftExpanded.src;
	delete ft.ftExpanded['src/components'];
	ft.saveExpandedState();
	assert.equal(storage.getItem('onair-ft-expanded'), null, 'cleared state removes key again');
});
