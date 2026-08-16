// CJS unit tests for rootDir guard — uses the same mock setup as server-entry.cjs
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const os = require('node:os');
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

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    }).on('error', reject);
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

// ─── Tests ───────────────────────────────────────────────────────────────────

test('/api/tree returns empty entries when rootDir is empty string', async () => {
  const mdPath = path.join(FIXTURE_DIR, 'README.md');
  const id = server.registerDocument(
    'test://empty-rootdir.md',
    'Empty RootDir',
    fs.readFileSync(mdPath, 'utf8'),
    'markdown',
    '',  // rootDir = empty
    mdPath
  );

  const res = await httpGet(`${baseUrl}/api/tree?id=${id}&dir=`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.entries, []);
  assert.equal(res.body.dir, '');
});

test('/api/file-index returns empty entries when rootDir is empty string', async () => {
  const mdPath = path.join(FIXTURE_DIR, 'README.md');
  const id = server.registerDocument(
    'test://empty-rootdir-index.md',
    'Empty RootDir Index',
    fs.readFileSync(mdPath, 'utf8'),
    'markdown',
    '',  // rootDir = empty
    mdPath
  );

  const res = await httpGet(`${baseUrl}/api/file-index?id=${id}`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.entries, []);
});

test('/api/tree returns empty entries when rootDir is /', async () => {
  const mdPath = path.join(FIXTURE_DIR, 'README.md');
  const id = server.registerDocument(
    'test://root-rootdir.md',
    'Root RootDir',
    fs.readFileSync(mdPath, 'utf8'),
    'markdown',
    '/',  // rootDir = /
    mdPath
  );

  const res = await httpGet(`${baseUrl}/api/tree?id=${id}&dir=`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.entries, []);
});

test('/api/file-index returns empty entries when rootDir is /', async () => {
  const mdPath = path.join(FIXTURE_DIR, 'README.md');
  const id = server.registerDocument(
    'test://root-rootdir-index.md',
    'Root RootDir Index',
    fs.readFileSync(mdPath, 'utf8'),
    'markdown',
    '/',  // rootDir = /
    mdPath
  );

  const res = await httpGet(`${baseUrl}/api/file-index?id=${id}`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.entries, []);
});

test('/api/tree returns empty entries when rootDir resolves to cwd', async () => {
  const mdPath = path.join(FIXTURE_DIR, 'README.md');
  // A relative path like '.' resolves to cwd via path.resolve('.')
  const id = server.registerDocument(
    'test://cwd-rootdir.md',
    'Cwd RootDir',
    fs.readFileSync(mdPath, 'utf8'),
    'markdown',
    '.',  // rootDir = '.' → resolves to cwd
    mdPath
  );

  const res = await httpGet(`${baseUrl}/api/tree?id=${id}&dir=`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.entries, []);
});

test('/api/file-index returns empty entries when rootDir resolves to cwd', async () => {
  const mdPath = path.join(FIXTURE_DIR, 'README.md');
  const id = server.registerDocument(
    'test://cwd-rootdir-index.md',
    'Cwd RootDir Index',
    fs.readFileSync(mdPath, 'utf8'),
    'markdown',
    '.',  // rootDir = '.' → resolves to cwd
    mdPath
  );

  const res = await httpGet(`${baseUrl}/api/file-index?id=${id}`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.entries, []);
});

test('/api/tree returns entries when rootDir is a valid fixture dir', async () => {
  const mdPath = path.join(FIXTURE_DIR, 'README.md');
  const id = server.registerDocument(
    'test://valid-rootdir.md',
    'Valid RootDir',
    fs.readFileSync(mdPath, 'utf8'),
    'markdown',
    FIXTURE_DIR,
    mdPath
  );

  const res = await httpGet(`${baseUrl}/api/tree?id=${id}&dir=`);
  assert.equal(res.status, 200);
  assert.ok(res.body.entries.length > 0, 'should have entries for valid rootDir');
});

test('/api/file-index returns entries when rootDir is a valid fixture dir', async () => {
  const mdPath = path.join(FIXTURE_DIR, 'README.md');
  const id = server.registerDocument(
    'test://valid-rootdir-index.md',
    'Valid RootDir Index',
    fs.readFileSync(mdPath, 'utf8'),
    'markdown',
    FIXTURE_DIR,
    mdPath
  );

  const res = await httpGet(`${baseUrl}/api/file-index?id=${id}`);
  assert.equal(res.status, 200);
  assert.ok(res.body.entries.length > 0, 'should have entries for valid rootDir');
});

test('/api/tree returns 404 for unknown document id', async () => {
  const res = await httpGet(`${baseUrl}/api/tree?id=nonexistent&dir=`);
  assert.equal(res.status, 404);
});

test('/api/file-index returns 404 for unknown document id', async () => {
  const res = await httpGet(`${baseUrl}/api/file-index?id=nonexistent`);
  assert.equal(res.status, 404);
});

// ─── Iframe tests ────────────────────────────────────────────────────────────

function httpGetWithFollow(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    function doRequest(u, redirectsLeft) {
      http.get(u, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
          const redirectUrl = new URL(res.headers.location, u).href;
          res.resume();
          doRequest(redirectUrl, redirectsLeft - 1);
          return;
        }
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        });
      }).on('error', reject);
    }
    doRequest(url, maxRedirects);
  });
}

test('iframe markdown renders <iframe> tag with correct src', async () => {
  const mdPath = path.join(FIXTURE_DIR, 'iframe-test.md');
  const id = server.registerDocument(
    'test://iframe-test.md',
    'Iframe Test',
    fs.readFileSync(mdPath, 'utf8'),
    'markdown',
    FIXTURE_DIR,
    mdPath
  );

  const res = await httpGet(`${baseUrl}/preview/${id}`);
  assert.equal(res.status, 200);
  assert.ok(res.body.includes('<iframe'), 'page should contain <iframe> tag');
  assert.ok(res.body.includes('embeds/embed-001.html'), 'iframe src should reference embed-001.html');
});

test('static HTML asset is served raw (not redirected) when requested from preview', async () => {
  const mdPath = path.join(FIXTURE_DIR, 'iframe-test.md');
  const id = server.registerDocument(
    'test://iframe-test-2.md',
    'Iframe Test 2',
    fs.readFileSync(mdPath, 'utf8'),
    'markdown',
    FIXTURE_DIR,
    mdPath
  );

  // Simulate iframe request with Referer pointing to the preview page
  const iframeUrl = `${baseUrl}/preview/${id}/embeds/embed-001.html`;
  const res = await new Promise((resolve, reject) => {
    const req = http.get(iframeUrl, {
      headers: { 'Referer': `${baseUrl}/preview/${id}` }
    }, (resp) => {
      let data = '';
      resp.on('data', (chunk) => { data += chunk; });
      resp.on('end', () => {
        resolve({ status: resp.statusCode, headers: resp.headers, body: data });
      });
    });
    req.on('error', reject);
  });

  // Should return raw HTML, NOT redirect to preview
  assert.equal(res.status, 200, 'should return 200, not redirect');
  assert.ok(res.body.includes('Hello from iframe'), 'should contain raw HTML content');
  assert.ok(!res.body.includes('onair-md'), 'should NOT be wrapped in preview template');
});

test('static HTML asset redirects to preview when no Referer (direct navigation)', async () => {
  const mdPath = path.join(FIXTURE_DIR, 'iframe-test.md');
  const id = server.registerDocument(
    'test://iframe-test-3.md',
    'Iframe Test 3',
    fs.readFileSync(mdPath, 'utf8'),
    'markdown',
    FIXTURE_DIR,
    mdPath
  );

  // Direct request without Referer (simulates user clicking a link)
  const res = await httpGetWithFollow(`${baseUrl}/preview/${id}/embeds/embed-001.html`, 0);
  // Should redirect (302) since no Referer
  assert.equal(res.status, 302, 'direct request should redirect to preview');
  assert.ok(res.headers.location && res.headers.location.includes('/preview/'), 'should redirect to preview page');
});

test('missing iframe file: page still renders, text below iframe is visible', async () => {
  const mdPath = path.join(FIXTURE_DIR, 'iframe-missing-test.md');
  const id = server.registerDocument(
    'test://iframe-missing-test.md',
    'Iframe Missing Test',
    fs.readFileSync(mdPath, 'utf8'),
    'markdown',
    FIXTURE_DIR,
    mdPath
  );

  const res = await httpGet(`${baseUrl}/preview/${id}`);
  assert.equal(res.status, 200);
  // Page should contain the iframe tag (markdown rendered it)
  assert.ok(res.body.includes('<iframe'), 'page should contain <iframe> tag');
  // Page should contain the text after the iframe
  assert.ok(res.body.includes('This text should still appear'), 'text after iframe should be present');
  // The iframe src should reference the missing file
  assert.ok(res.body.includes('embeds/nonexistent.html'), 'iframe src should reference nonexistent file');
});

test('missing iframe: requesting the nonexistent file returns 404', async () => {
  const mdPath = path.join(FIXTURE_DIR, 'iframe-missing-test.md');
  const id = server.registerDocument(
    'test://iframe-missing-test-2.md',
    'Iframe Missing Test 2',
    fs.readFileSync(mdPath, 'utf8'),
    'markdown',
    FIXTURE_DIR,
    mdPath
  );

  const res = await new Promise((resolve, reject) => {
    http.get(`${baseUrl}/preview/${id}/embeds/nonexistent.html`, {
      headers: { 'Referer': `${baseUrl}/preview/${id}` }
    }, (resp) => {
      let data = '';
      resp.on('data', (chunk) => { data += chunk; });
      resp.on('end', () => {
        resolve({ status: resp.statusCode, body: data });
      });
    }).on('error', reject);
  });

  assert.equal(res.status, 404, 'missing file should return 404');
});

// ─── Regression: asset next to doc but outside rootDir ──────────────────────
// Scenario from issue: a markdown file lives in its OWN project folder (where
// its sibling `images/` folder also lives), but VS Code reports a DIFFERENT
// workspace root. Previously the relative path was computed from the workspace
// root, producing an escaped `../../..` URL and a 404. The asset must resolve
// relative to the document directory and still be served.

function httpGetRaw(url, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get(url, { headers }, (resp) => {
      let data = '';
      resp.on('data', (chunk) => { data += chunk; });
      resp.on('end', () => resolve({ status: resp.statusCode, headers: resp.headers, body: data }));
    }).on('error', reject);
  });
}

test('asset next to doc is served even when rootDir is a different project', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'onair-img-'));
  let id;
  try {
    const docDir = tmp;
    const imgDir = path.join(docDir, 'images');
    fs.mkdirSync(imgDir);
    fs.writeFileSync(path.join(imgDir, 'pic.jpg'), 'fakeimagebytes');
    const mdPath = path.join(docDir, 'doc.md');
    const md = '![](images/pic.jpg)';
    fs.writeFileSync(mdPath, md);

    // Register with rootDir pointing at the FIXTURE dir — a DIFFERENT project
    // than where the document (and its images) actually live.
    id = server.registerDocument(
      'test://img-outside-root.md',
      'Img Outside Root',
      md,
      'markdown',
      FIXTURE_DIR,
      mdPath
    );

    // The rendered markdown must reference the image relative to the DOCUMENT
    // directory (images/pic.jpg), NOT an escaped ../../.. path from rootDir.
    const page = await httpGet(`${baseUrl}/preview/${id}`);
    assert.equal(page.status, 200);
    assert.ok(page.body.includes('src="images/pic.jpg"'), 'image src should be docDir-relative');
    assert.ok(!page.body.includes('../'), 'image src should not be an escaped path');

    // Requesting that (docDir-relative) URL as an embedded sub-resource must
    // return the file, not a 404.
    const img = await httpGetRaw(`${baseUrl}/preview/${id}/images/pic.jpg`, {
      'Referer': `${baseUrl}/preview/${id}`,
      'Accept': 'image/jpeg,*/*'
    });
    assert.equal(img.status, 200, 'image should be served (was 404 under old rootDir-relative logic)');
    assert.equal(img.body, 'fakeimagebytes');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

