#!/usr/bin/env node
// Copies the ripgrep (`rg`) binary shipped by @vscode/ripgrep into dist/ripgrep so
// the packaged extension can shell out to it for content search (node_modules is
// excluded from the .vsix, and getRgPath() resolves this path first).
//
// The binary is platform-specific and selected by @vscode/ripgrep at install time,
// so the copied binary matches the build machine's platform. Cross-platform Marketplace
// publishing would need per-platform binaries — acceptable for internal/team use.
import { existsSync, mkdirSync, copyFileSync, chmodSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// The binary ships in a platform-specific optional dependency; @vscode/ripgrep
// resolves its real path via rgPath, so use that rather than a fixed bin/ path.
let SRC = '';
try { SRC = require('@vscode/ripgrep').rgPath; } catch { /* package missing */ }
const OUT_DIR = join(ROOT, 'dist', 'ripgrep');
const OUT = join(OUT_DIR, 'rg');

if (!SRC || !existsSync(SRC)) {
	console.warn(`ripgrep binary not found — content search will fall back to Node grep.`);
	process.exit(0);
}

mkdirSync(OUT_DIR, { recursive: true });
copyFileSync(SRC, OUT);
try { chmodSync(OUT, 0o755); } catch { /* best effort — binary copy is what matters */ }
console.log(`copied ripgrep binary → ${OUT}`);
