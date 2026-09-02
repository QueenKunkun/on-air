#!/usr/bin/env node
// Checks for a system ripgrep (`rg`). If found on PATH, nothing to copy.
// If missing, prints a warning (the extension will fall back to Node grep).
import { execFileSync } from 'child_process';

try {
	const bin = process.platform === 'win32' ? 'rg.exe' : 'rg';
	const p = execFileSync('which', [bin], { encoding: 'utf8', timeout: 3000 }).trim();
	console.log(`system ripgrep found: ${p}`);
} catch {
	console.warn('ripgrep not found on PATH — content search will fall back to (slower) Node grep.');
	console.warn('Install it with: brew install ripgrep  /  apt install ripgrep  /  winget install BurntSushi.ripgrep.MSVC');
}
