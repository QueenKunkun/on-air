#!/usr/bin/env node
// Copies KaTeX woff2 fonts into dist/katex/fonts so the extension can serve
// them from the packaged bundle (node_modules is excluded from the .vsix).
// Only woff2 is shipped — every modern browser supports it and it keeps the
// package under the 1 MB check-size limit; woff/ttf fall back to system fonts.
import { existsSync, mkdirSync, cpSync, readdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'node_modules', 'katex', 'dist', 'fonts');
const OUT = join(ROOT, 'dist', 'katex', 'fonts');

if (!existsSync(SRC)) {
	console.error(`katex fonts not found at ${SRC} — run pnpm i first`);
	process.exit(1);
}

mkdirSync(OUT, { recursive: true });
const files = readdirSync(SRC).filter((f) => /\.woff2$/i.test(f));
for (const f of files) cpSync(join(SRC, f), join(OUT, f));
console.log(`copied ${files.length} katex woff2 fonts → ${OUT}`);