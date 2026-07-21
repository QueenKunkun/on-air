// Playwright global setup: spawn the preview server with mocked vscode
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default async function setup() {
  const child = spawn('node', ['--import', 'tsx', path.join(__dirname, 'server-entry.cjs')], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Wait for "Server ready on port NNNN"
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server startup timed out')), 10000);
    child.stdout.on('data', (chunk) => {
      const line = chunk.toString();
      if (line.includes('Server ready on port')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        clearTimeout(timeout);
        reject(new Error(`Server exited with code ${code}`));
      }
    });
  });

  // Read server info written by server-entry.cjs
  const infoPath = path.join(__dirname, '.server-info.json');
  const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));

  // Store for teardown
  globalThis.__testServerPid = child.pid;
}
