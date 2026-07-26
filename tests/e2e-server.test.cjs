const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('fs');
const path = require('path');
const Module = require('node:module');

// ─── Mocks ──────────────────────────────────────────────────────────────────

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function httpGet(url, headers = {}) {
	return new Promise((resolve, reject) => {
		const parsed = new URL(url);
		const reqHeaders = { ...headers };
		const req = http.request({
			hostname: parsed.hostname,
			port: parsed.port,
			path: parsed.pathname + parsed.search,
			method: 'GET',
			headers: reqHeaders,
		}, (res) => {
			let data = '';
			res.on('data', (chunk) => { data += chunk; });
			res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
		});
		req.on('error', reject);
		req.end();
	});
}

// ─── Setup / Teardown ────────────────────────────────────────────────────────

let server;
let baseUrl;
const FIXTURE_DIR = path.join(__dirname, 'filetree.fixture');

before(async () => {
	const { PreviewServer } = await import('../src/server.ts');
	server = new PreviewServer();
	const port = await server.start(0);
	baseUrl = `http://127.0.0.1:${port}`;
});

after(() => {
	server?.stop();
});

// ─── E2E: Full preview lifecycle ────────────────────────────────────────────

test('E2E: register document → preview page loads with full HTML', async () => {
	const mdPath = path.join(FIXTURE_DIR, 'README.md');
	const content = fs.readFileSync(mdPath, 'utf8');
	const id = server.registerDocument(
		'test://e2e-fullpage.md', 'E2E Full Page', content,
		'markdown', FIXTURE_DIR, mdPath
	);

	const res = await httpGet(`${baseUrl}/preview/${id}`);

	assert.equal(res.status, 200);
	assert.equal(res.headers['content-type'], 'text/html; charset=utf-8');
	assert.ok(res.body.includes('<!DOCTYPE html'), 'full HTML document');
	assert.ok(res.body.includes('E2E Full Page'), 'title present');
	assert.ok(res.body.includes(`window.__ONAIR__`), 'ONAIR config present');
	assert.ok(res.body.includes(id), 'document id in page');
	assert.ok(res.body.includes('preview.js') || res.body.includes('(()=>{'), 'Preact JS embedded');
});

test('E2E: register document → WebSocket upgrade works', async () => {
	const mdPath = path.join(FIXTURE_DIR, 'README.md');
	const content = fs.readFileSync(mdPath, 'utf8');
	const id = server.registerDocument(
		'test://e2e-ws.md', 'E2E WS', content,
		'markdown', FIXTURE_DIR, mdPath
	);

	// Verify the websocket endpoint exists by checking upgrade handling
	const wsUrl = new URL(`/ws/${id}`, baseUrl);
	const ws = new (require('ws').WebSocket)(wsUrl.href);

	await new Promise((resolve, reject) => {
		const timeout = setTimeout(() => { ws.close(); reject(new Error('WS timeout')); }, 3000);
		ws.on('open', () => { clearTimeout(timeout); ws.close(); resolve(); });
		ws.on('error', (err) => { clearTimeout(timeout); reject(err); });
	});
});

test('E2E: static asset serving with Referer', async () => {
	const mdPath = path.join(FIXTURE_DIR, 'README.md');
	const content = fs.readFileSync(mdPath, 'utf8');
	const id = server.registerDocument(
		'test://e2e-static.md', 'E2E Static', content,
		'markdown', FIXTURE_DIR, mdPath
	);

	const htmlPath = path.join(FIXTURE_DIR, 'linked.html');
	if (!fs.existsSync(htmlPath)) return; // skip if fixture missing

	const encodedPath = encodeURIComponent(htmlPath);
	const res = await httpGet(
		`${baseUrl}/preview/${id}/${encodedPath}`,
		{ Referer: `${baseUrl}/preview/${id}` }
	);
	assert.equal(res.status, 200);
	assert.ok(res.body.includes('Hello from HTML'));
});

test('E2E: tree API returns valid JSON', async () => {
	const mdPath = path.join(FIXTURE_DIR, 'README.md');
	const content = fs.readFileSync(mdPath, 'utf8');
	const id = server.registerDocument(
		'test://e2e-tree.md', 'E2E Tree', content,
		'markdown', FIXTURE_DIR, mdPath
	);

	const res = await httpGet(`${baseUrl}/api/tree?id=${id}&dir=`);
	assert.equal(res.status, 200);
	const json = JSON.parse(res.body);
	assert.ok(Array.isArray(json.entries), 'entries is array');
});

test('E2E: file API returns valid JSON', async () => {
	const mdPath = path.join(FIXTURE_DIR, 'README.md');
	const content = fs.readFileSync(mdPath, 'utf8');
	const id = server.registerDocument(
		'test://e2e-file.md', 'E2E File', content,
		'markdown', FIXTURE_DIR, mdPath
	);

	const encodedPath = encodeURIComponent(mdPath);
	const res = await httpGet(`${baseUrl}/api/file?id=${id}&path=${encodedPath}`);
	assert.equal(res.status, 200);
	const json = JSON.parse(res.body);
	assert.ok('content' in json, 'has content field');
	assert.equal(json.ext, '.md');
});

test('E2E: preview page contains correct __ONAIR__ config', async () => {
	const mdPath = path.join(FIXTURE_DIR, 'README.md');
	const content = fs.readFileSync(mdPath, 'utf8');
	const id = server.registerDocument(
		'test://e2e-config.md', 'Config Test', content,
		'markdown', FIXTURE_DIR, mdPath
	);

	const res = await httpGet(`${baseUrl}/preview/${id}`);
	assert.equal(res.status, 200);

	assert.ok(res.body.includes('window.__ONAIR__'), '__ONAIR__ config block found');
	assert.ok(res.body.includes(`"${id}"`), 'document id in config');
	assert.ok(res.body.includes('themes:'), 'themes in config');
	assert.ok(res.body.includes('version:'), 'version in config');
	assert.ok(res.body.includes(mdPath), 'fullPath in config');
});

test('E2E: unknown preview ID returns 404', async () => {
	const res = await httpGet(`${baseUrl}/preview/nonexistent`);
	assert.equal(res.status, 404);
});

test('E2E: updateDocument triggers WebSocket broadcast', async () => {
	const mdPath = path.join(FIXTURE_DIR, 'README.md');
	const content = fs.readFileSync(mdPath, 'utf8');
	const id = server.registerDocument(
		'test://e2e-update.md', 'Update Test', content,
		'markdown', FIXTURE_DIR, mdPath
	);

	const wsUrl = new URL(`/ws/${id}`, baseUrl);
	const ws = new (require('ws').WebSocket)(wsUrl.href);

	const msgPromise = new Promise((resolve, reject) => {
		const timeout = setTimeout(() => { ws.close(); reject(new Error('WS message timeout')); }, 3000);
		ws.on('message', (data) => {
			clearTimeout(timeout);
			const msg = JSON.parse(data.toString());
			ws.close();
			resolve(msg);
		});
		ws.on('error', (err) => { clearTimeout(timeout); reject(err); });
	});

	// Wait for WS to be connected
	await new Promise((resolve) => {
		if (ws.readyState === 1) resolve();
		else ws.on('open', resolve);
	});

	// Update the document
	server.updateDocument(
		'test://e2e-update.md', 'Updated Title', '# Updated\n\nNew content',
		'markdown', mdPath
	);

	const msg = await msgPromise;
	assert.equal(msg.type, 'update');
	assert.equal(msg.title, 'Updated Title');
	assert.ok(msg.html.includes('Updated'));
});

// ─── Port fallback tests ────────────────────────────────────────────────────

let { PreviewServer } = {};

test('load PreviewServer for port tests', async () => {
	const mod = await import('../src/server.ts');
	PreviewServer = mod.PreviewServer;
});

test('port fallback: second server auto-picks next port when preferred is occupied', async () => {
	const s1 = new PreviewServer();
	await s1.start(0);
	const s2 = new PreviewServer();
	await s2.start(s1.port);
	assert.equal(s2.port, s1.port + 1, 'second server uses port+1');
	s2.stop();
	s1.stop();
});

test('port fallback: buildUrl uses actual port, not requested port', async () => {
	const s = new PreviewServer();
	const requestedPort = 19876;
	await s.start(requestedPort);
	const id = s.registerDocument('test://port-test.md', 'Port Test', '# hello', 'markdown', '', '');
	const url = s.buildUrl(id);
	assert.ok(url.includes(`:${s.port}/`), 'URL uses actual port');
	assert.equal(s.port, requestedPort, 'actual port matches requested when available');
	s.stop();
});

test('port fallback: EADDRINUSE after exhausting all retries', async () => {
	// Block a range of ports to force failure
	const blockers = [];
	const startPort = 19880;
	for (let i = 0; i < 31; i++) {
		const b = new PreviewServer();
		await b.start(startPort + i);
		blockers.push(b);
	}
	const s = new PreviewServer();
	await assert.rejects(
		() => s.start(startPort),
		(err) => err.code === 'EADDRINUSE',
		'throws EADDRINUSE when all 31 ports taken'
	);
	for (const b of blockers) b.stop();
});

// ─── Image preview test ──────────────────────────────────────────────────────

test('E2E: image preview renders base64 data URL', async () => {
	// Create a tiny 1x1 red PNG (67 bytes)
	const pngBuf = Buffer.from(
		'89504e470d0a1a0a0000000d4948445200000001000000010802000000' +
		'900104000000b0' + // IDAT chunk header + compressed red pixel
		'ffffff' + // filter byte + RGB
		'0000000c4944415408d763f8cf80000000201' +
		'010000050001a2fd5e0000000049454e44ae426082', 'hex');
	const imgPath = path.join(FIXTURE_DIR, 'test-image.png');
	fs.writeFileSync(imgPath, pngBuf);

	const id = server.registerDocument(
		'test://e2e-image.png', 'Test Image', imgPath,
		'image', FIXTURE_DIR, imgPath
	);

	const res = await httpGet(`${baseUrl}/preview/${id}`);
	assert.equal(res.status, 200);
	assert.equal(res.headers['content-type'], 'text/html; charset=utf-8');
	assert.ok(res.body.includes('data:image/png;base64,'), 'base64 data URL present');
	assert.ok(res.body.includes('Test Image'), 'title present');

	fs.unlinkSync(imgPath);
});
