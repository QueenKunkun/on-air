// CJS integration test for KaTeX: rendering + self-hosted font serving.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const Module = require('node:module');

// ─── Mocks (must run before importing server.ts) ────────────────────────────
globalThis.__ONAIR_VERSION__ = 'test';

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
	if (request === 'vscode') {
		return path.join(__dirname, 'vscode.mock.js');
	}
	return origResolve.call(this, request, parent, isMain, options);
};

require.extensions['.css'] = function (module, filename) {
	module.exports = fs.readFileSync(filename, 'utf8');
};
require.extensions['.html'] = function (module, filename) {
	module.exports = fs.readFileSync(filename, 'utf8');
};

function httpGet(url, headers = {}) {
	return new Promise((resolve, reject) => {
		http.get(url, { headers }, (res) => {
			let data = '';
			res.on('data', (chunk) => { data += chunk; });
			res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
		}).on('error', reject);
	});
}

let server;
let baseUrl;

before(async () => {
	const { PreviewServer } = await import('../src/server.ts');
	server = new PreviewServer();
	const port = await server.start(0);
	baseUrl = `http://127.0.0.1:${port}`;
});

after(() => { server?.stop(); });

test('markdown page includes KaTeX CSS and rendered math', async () => {
	const id = server.registerDocument(
		'test://katex.md',
		'KaTeX',
		'公式 $E=mc^2$ 与 $$\\int_0^1 x^2\\,dx$$',
		'markdown',
		'/',
		path.join(__dirname, 'filetree.fixture', 'katex.md')
	);
	const res = await httpGet(`${baseUrl}/preview/${id}`);
	assert.equal(res.status, 200);
	assert.ok(res.body.includes('class="katex"'), 'rendered HTML should contain katex span');
	assert.ok(res.body.includes('katex-display'), 'block math should be display mode');
	assert.ok(res.body.includes('/__onair__/katex/fonts/'), 'katex CSS should reference self-hosted font route');
});

test('self-hosted KaTeX font is served from /__onair__/katex/fonts/', async () => {
	const res = await httpGet(`${baseUrl}/__onair__/katex/fonts/KaTeX_Main-Regular.woff2`);
	assert.equal(res.status, 200, 'font request should return 200');
	assert.match(res.headers['content-type'] || '', /font\/woff2/, 'content-type should be font/woff2');
	assert.ok((res.body || '').length > 0, 'font body should not be empty');
});

test('KaTeX font route rejects non-font extensions', async () => {
	const bad = await httpGet(`${baseUrl}/__onair__/katex/fonts/evil.exe`);
	assert.equal(bad.status, 400, 'non-font extension should be rejected with 400');
});

test('KaTeX font route neutralizes path traversal', async () => {
	// new URL() normalizes `..` before the handler runs, so this escapes the
	// /fonts/ prefix and 404s — the file is never served.
	const traversal = await httpGet(`${baseUrl}/__onair__/katex/fonts/../server.ts`);
	assert.notEqual(traversal.status, 200, 'traversal must not serve a file');
});
