#!/usr/bin/env node
import { statSync } from 'fs';
import { execSync } from 'child_process';
import { createInterface } from 'readline';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = 'on-air.vsix';
const LIMIT = 1024 * 1024;

function human(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  return (bytes / 1024).toFixed(0) + ' KB';
}

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, a => { rl.close(); resolve(a); }));
}

console.log(`Packaging ${OUT} …`);
execSync(`vsce package --no-dependencies -o ${OUT}`, { cwd: ROOT, stdio: 'inherit' });

const size = statSync(`${ROOT}${OUT}`).size;

if (size <= LIMIT) {
  console.log(`✓ ${OUT} = ${human(size)} (under 1 MB)`);
  process.exit(0);
}

console.log(`⚠ ${OUT} = ${human(size)} (over 1 MB)`);

if (process.env.ALLOW_LARGE_VSIX === '1') {
  console.log('ALLOW_LARGE_VSIX=1 set — continuing.');
  process.exit(0);
}

const answer = (await ask('Publish anyway? (y/N) ')).trim().toLowerCase();
if (answer === 'y' || answer === 'yes') {
  process.exit(0);
}
console.error('Aborted: package exceeds 1 MB.');
process.exit(1);
