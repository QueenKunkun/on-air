const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const Module = require('node:module');

// ─── Mocks (must run before any import of server.ts) ────────────────────────

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
    const reqHeaders = {};
    for (const [k, v] of Object.entries(headers)) { reqHeaders[k] = v; }
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: reqHeaders,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        }
      });
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

// ─── handleTree ─────────────────────────────────────────────────────────────

test('handleTree returns empty entries when rootDir is empty string', async () => {
  const mdPath = path.join(FIXTURE_DIR, 'README.md');
  const id = server.registerDocument(
    'test://routes-empty-rootdir.md', 'Empty', fs.readFileSync(mdPath, 'utf8'),
    'markdown', '', mdPath
  );
  const res = await httpGet(`${baseUrl}/api/tree?id=${id}&dir=`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.entries, []);
});

test('handleTree returns empty entries when rootDir is /', async () => {
  const mdPath = path.join(FIXTURE_DIR, 'README.md');
  const id = server.registerDocument(
    'test://routes-root-rootdir.md', 'Root', fs.readFileSync(mdPath, 'utf8'),
    'markdown', '/', mdPath
  );
  const res = await httpGet(`${baseUrl}/api/tree?id=${id}&dir=`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.entries, []);
});

test('handleTree returns entries when rootDir is a valid fixture dir', async () => {
  const mdPath = path.join(FIXTURE_DIR, 'README.md');
  const id = server.registerDocument(
    'test://routes-valid-rootdir.md', 'Valid', fs.readFileSync(mdPath, 'utf8'),
    'markdown', FIXTURE_DIR, mdPath
  );
  const res = await httpGet(`${baseUrl}/api/tree?id=${id}&dir=`);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.entries));
});

test('handleTree returns 404 for unknown document id', async () => {
  const res = await httpGet(`${baseUrl}/api/tree?id=nonexistent&dir=`);
  assert.equal(res.status, 404);
});

// ─── tree / fileIndex mismatch (regression: dirHasVisibleFiles bug) ────────

const DIR_FILTER_FIXTURE = path.join(FIXTURE_DIR, 'dir-filter-mismatch');

test('tree returns dir with unsupported files, fileIndex does not — must not hide dir', async () => {
  // Scenario: subdir-unsupported/ has only .bin/.docx files.
  // Tree API (hideBinary=0) returns the dir. FileIndex filters by isSupportedExt,
  // so it does NOT include .bin/.docx.  The old dirHasVisibleFiles frontend code
  // would hide this dir because fileIndex says it has no visible files.
  const mdPath = path.join(DIR_FILTER_FIXTURE, 'README.md');
  const id = server.registerDocument(
    'test://dir-filter-mismatch.md', 'Mismatch', fs.readFileSync(mdPath, 'utf8'),
    'markdown', DIR_FILTER_FIXTURE, mdPath
  );

  // 1) Tree API returns subdir-unsupported (hideBinary not set → includes .bin/.docx)
  const treeRes = await httpGet(`${baseUrl}/api/tree?id=${id}&dir=`);
  assert.equal(treeRes.status, 200);
  const treeDirNames = treeRes.body.entries.filter(e => e.type === 'directory').map(e => e.name);
  assert.ok(treeDirNames.includes('subdir-unsupported'),
    `tree should include subdir-unsupported, got: ${treeDirNames}`);

  // 2) FileIndex does NOT include the .bin file
  const idxRes = await httpGet(`${baseUrl}/api/file-index?id=${id}`);
  assert.equal(idxRes.status, 200);
  const idxBinFiles = idxRes.body.entries.filter(e => e.name === 'data.bin');
  assert.equal(idxBinFiles.length, 0,
    'fileIndex must not include .bin files (unsupported ext)');

  // 3) FileIndex also does not include .docx
  const idxDocx = idxRes.body.entries.filter(e => e.name === 'doc.docx');
  assert.equal(idxDocx.length, 0,
    'fileIndex must not include .docx files (unsupported ext)');

  // 4) The critical invariant: tree has the directory, fileIndex does NOT have
  //    its files. This is the exact scenario that caused dirHasVisibleFiles to
  //    hide the directory. If dirHasVisibleFiles were restored, the frontend
  //    would filter out subdir-unsupported because fileIndex says it has no
  //    visible files — even though the tree API says it does.
  const idxFilesInSubdir = idxRes.body.entries.filter(e =>
    e.type === 'file' && e.path.startsWith('subdir-unsupported/')
  );
  assert.equal(idxFilesInSubdir.length, 0,
    'fileIndex must have zero files in subdir-unsupported (all unsupported ext)');

  // This confirms the mismatch: tree has the dir, fileIndex has nothing in it.
  // Any frontend code that uses fileIndex to filter tree entries will break.
  assert.ok(treeDirNames.includes('subdir-unsupported'),
    'tree MUST still return subdir-unsupported despite fileIndex having no files in it');
});

test('tree with hideBinary=1 excludes unsupported files like fileIndex does', async () => {
  const mdPath = path.join(DIR_FILTER_FIXTURE, 'README.md');
  const id = server.registerDocument(
    'test://dir-filter-hidebin.md', 'HideBin', fs.readFileSync(mdPath, 'utf8'),
    'markdown', DIR_FILTER_FIXTURE, mdPath
  );

  const treeRes = await httpGet(`${baseUrl}/api/tree?id=${id}&dir=&hideBinary=1`);
  assert.equal(treeRes.status, 200);
  const treeDirNames = treeRes.body.entries.filter(e => e.type === 'directory').map(e => e.name);
  // With hideBinary=1, tree filters by isSupportedExt like fileIndex does.
  // subdir-unsupported only has .bin/.docx → dir has no visible children → excluded.
  assert.ok(!treeDirNames.includes('subdir-unsupported'),
    'tree with hideBinary=1 should exclude subdir-unsupported (only unsupported files)');
  // subdir-supported has .md/.js → still included
  assert.ok(treeDirNames.includes('subdir-supported'),
    'tree with hideBinary=1 should include subdir-supported (has .md/.js)');
});

// ─── handleFile ─────────────────────────────────────────────────────────────

test('handleFile serves existing file content', async () => {
	const mdPath = path.join(FIXTURE_DIR, 'README.md');
	const content = fs.readFileSync(mdPath, 'utf8');
	const id = server.registerDocument(
		'test://routes-file.md', 'File', content, 'markdown', FIXTURE_DIR, mdPath
	);
	const encodedPath = encodeURIComponent(mdPath);
	const res = await httpGet(`${baseUrl}/api/file?id=${id}&path=${encodedPath}`);
	assert.equal(res.status, 200);
	assert.ok(res.body.content !== undefined, 'response has content field');
	assert.equal(res.body.ext, '.md');
});

test('handleFile returns 404 for nonexistent file path', async () => {
  const mdPath = path.join(FIXTURE_DIR, 'README.md');
  const id = server.registerDocument(
    'test://routes-file-miss.md', 'Miss', fs.readFileSync(mdPath, 'utf8'),
    'markdown', FIXTURE_DIR, mdPath
  );
  const res = await httpGet(`${baseUrl}/api/file?id=${id}&path=${encodeURIComponent('/nonexistent/file.md')}`);
  assert.equal(res.status, 404);
});

test('handleFile returns 404 for unknown document id', async () => {
  const res = await httpGet(`${baseUrl}/api/file?id=unknown&path=foo`);
  assert.equal(res.status, 404);
});

// ─── handleFileIndex ────────────────────────────────────────────────────────

test('handleFileIndex returns empty entries when rootDir is empty string', async () => {
  const mdPath = path.join(FIXTURE_DIR, 'README.md');
  const id = server.registerDocument(
    'test://routes-fileindex-empty.md', 'Empty', fs.readFileSync(mdPath, 'utf8'),
    'markdown', '', mdPath
  );
  const res = await httpGet(`${baseUrl}/api/file-index?id=${id}`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.entries, []);
});

test('handleFileIndex returns entries when rootDir is valid fixture', async () => {
  const mdPath = path.join(FIXTURE_DIR, 'README.md');
  const id = server.registerDocument(
    'test://routes-fileindex-valid.md', 'Valid', fs.readFileSync(mdPath, 'utf8'),
    'markdown', FIXTURE_DIR, mdPath
  );
  const res = await httpGet(`${baseUrl}/api/file-index?id=${id}`);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.entries));
});

// ─── handleStatic ───────────────────────────────────────────────────────────

test('handleStatic serves raw HTML when Referer header present (iframe)', async () => {
  const htmlPath = path.join(FIXTURE_DIR, 'linked.html');
  if (!fs.existsSync(htmlPath)) { return; } // skip if fixture missing
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');
  const mdPath = path.join(FIXTURE_DIR, 'README.md');
  const id = server.registerDocument(
    'test://routes-static-html.md', 'Static', fs.readFileSync(mdPath, 'utf8'),
    'markdown', FIXTURE_DIR, mdPath
  );
  const encodedPath = encodeURIComponent(htmlPath);
  const res = await httpGet(`${baseUrl}/preview/${id}/${encodedPath}`, { Referer: `${baseUrl}/preview/${id}` });
  assert.equal(res.status, 200);
  assert.ok(res.body.includes('Hello from HTML'));
});

test('handleStatic redirects HTML when no Referer (direct navigation)', async () => {
  const htmlPath = path.join(FIXTURE_DIR, 'linked.html');
  if (!fs.existsSync(htmlPath)) { return; } // skip if fixture missing
  const mdPath = path.join(FIXTURE_DIR, 'README.md');
  const id = server.registerDocument(
    'test://routes-static-redirect.md', 'Redirect', fs.readFileSync(mdPath, 'utf8'),
    'markdown', FIXTURE_DIR, mdPath
  );
  const encodedPath = encodeURIComponent(htmlPath);
  const res = await httpGet(`${baseUrl}/preview/${id}/${encodedPath}`);
  assert.equal(res.status, 302);
  assert.ok(res.headers.location && res.headers.location.includes('/preview/'));
});

// ─── handlePreview ──────────────────────────────────────────────────────────

test('handlePreview returns HTML page for known document', async () => {
  const mdPath = path.join(FIXTURE_DIR, 'README.md');
  const content = fs.readFileSync(mdPath, 'utf8');
  const id = server.registerDocument(
    'test://routes-preview.md', 'Preview Test', content, 'markdown', FIXTURE_DIR, mdPath
  );
  const res = await httpGet(`${baseUrl}/preview/${id}`);
  assert.equal(res.status, 200);
  assert.ok(typeof res.body === 'string');
  assert.ok(res.body.includes('Preview Test') || res.body.includes('preview'));
});

test('handlePreview returns 404 for unknown document id', async () => {
  const res = await httpGet(`${baseUrl}/preview/nonexistent`);
  assert.equal(res.status, 404);
});
