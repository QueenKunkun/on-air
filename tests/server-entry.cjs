// CJS entry: register all mocks/handlers, then start server
const path = require('path');
const fs = require('fs');
const Module = require('module');

// 0. Define globals expected by webpack DefinePlugin
globalThis.__ONAIR_VERSION__ = 'test';

// 1. Mock 'vscode' module
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === 'vscode') {
    return path.join(__dirname, 'vscode.mock.js');
  }
  return origResolve.call(this, request, parent, isMain, options);
};

// 2. Handle .css and .html imports as text (replicate webpack asset/source)
require.extensions['.css'] = function (module, filename) {
  module.exports = fs.readFileSync(filename, 'utf8');
};
require.extensions['.html'] = function (module, filename) {
  module.exports = fs.readFileSync(filename, 'utf8');
};

// 3. Start server
const FIXTURE_DIR = path.join(__dirname, 'filetree.fixture');

async function main() {
  const { PreviewServer } = await import('../src/server.ts');
  const server = new PreviewServer();
  await server.start(0);

  const mdPath = path.join(FIXTURE_DIR, 'README.md');
  const id = server.registerDocument(
    'test://README.md',
    'Test README',
    fs.readFileSync(mdPath, 'utf8'),
    'markdown',
    FIXTURE_DIR,
    mdPath
  );

  const info = { port: server.port, id, baseUrl: `http://127.0.0.1:${server.port}` };
  const infoPath = path.join(__dirname, '.server-info.json');
  fs.writeFileSync(infoPath, JSON.stringify(info));
  console.log(`Server ready on port ${server.port}`);

  // Keep alive
  process.on('SIGTERM', () => { server.stop(); process.exit(0); });
  process.on('SIGINT', () => { server.stop(); process.exit(0); });
}

main().catch(err => { console.error(err); process.exit(1); });
