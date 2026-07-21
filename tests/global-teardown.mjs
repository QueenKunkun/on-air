import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { kill } from 'process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function teardown() {
  if (globalThis.__testServerPid) {
    try { kill(globalThis.__testServerPid, 'SIGTERM'); } catch {}
  }
  const infoPath = path.join(__dirname, '.server-info.json');
  if (fs.existsSync(infoPath)) fs.unlinkSync(infoPath);
}
