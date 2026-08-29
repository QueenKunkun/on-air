import * as fs from 'fs';
import * as path from 'path';

/**
 * Resolve the path to a ripgrep (`rg`) binary, with caching.
 *
 * Resolution order:
 *   1. A binary packaged next to the extension bundle (`dist/ripgrep/rg`), which
 *      `scripts/copy-ripgrep.mjs` copies out of `@vscode/ripgrep` at build time.
 *   2. The `@vscode/ripgrep` package's `rgPath` (dev / tsx runs).
 *
 * Returns `null` when no usable binary is found, so callers can fall back to a
 * pure-Node grep (also keeps unit tests green when rg is absent).
 */
let cached: string | null | undefined;

export function getRgPath(): string | null {
	if (cached !== undefined) { return cached; }

	const names = process.platform === 'win32' ? ['rg.exe'] : ['rg'];
	const candidates: string[] = [
		path.join(__dirname, 'ripgrep'),
		path.join(__dirname, '..', 'dist', 'ripgrep'),
	];
	for (const dir of candidates) {
		for (const name of names) {
			const p = path.join(dir, name);
			try { if (fs.existsSync(p)) { cached = p; return p; } } catch { /* try next */ }
		}
	}

	try {
		// @ts-ignore - @vscode/ripgrep is an optional dependency resolved at runtime
		const mod = require('@vscode/ripgrep') as { rgPath?: string };
		if (mod && mod.rgPath && fs.existsSync(mod.rgPath)) {
			cached = mod.rgPath;
			return cached;
		}
	} catch { /* package not installed — fall back to Node grep */ }

	cached = null;
	return null;
}
