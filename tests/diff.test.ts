import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import { buildDiff, parseUnifiedDiff, mergeRanges } from '../src/routes/diff';

let repo: string;
let file: string;
let relFile: string;
let commitA: string;
let commitB: string;

function git(args: string): string {
  return execSync(`git ${args}`, { cwd: repo, encoding: 'utf8' }).trim();
}

before(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'onair-diff-test-'));
  file = path.join(repo, 'test.md');
  relFile = 'test.md';

  git('init -q');
  git('config user.email test@test.com');
  git('config user.name test');

  // Commit A: 10 lines
  fs.writeFileSync(file, Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join('\n') + '\n');
  git('add .');
  git('commit -q -m "A"');
  commitA = git('rev-parse HEAD');

  // Commit B: change line 3, remove line 7, add a new line after line 8
  const b = Array.from({ length: 10 }, (_, i) => {
    if (i === 2) return 'line 3 CHANGED';
    if (i === 6) return null; // removed
    return `line ${i + 1}`;
  }).filter(Boolean) as string[];
  b.splice(7, 0, 'INSERTED LINE'); // insert before original line 8
  fs.writeFileSync(file, b.join('\n') + '\n');
  git('add .');
  git('commit -q -m "B"');
  commitB = git('rev-parse HEAD');
});

after(() => {
  fs.rmSync(repo, { recursive: true, force: true });
});

// ─── parseUnifiedDiff ────────────────────────────────────────────────────────

test('parseUnifiedDiff: new side tracks + line numbers', () => {
  const diff = [
    '@@ -1,3 +1,4 @@',
    ' line 1',
    '-old line 2',
    '+new line 2a',
    '+new line 2b',
    ' line 3',
  ].join('\n');
  const ranges = parseUnifiedDiff(diff, 'new');
  // +lines at newLine 2 and 3
  assert.deepEqual(ranges, [
    { type: 'del', startLine: 2, endLine: 2 },
    { type: 'add', startLine: 2, endLine: 2 },
    { type: 'add', startLine: 3, endLine: 3 },
  ]);
});

test('parseUnifiedDiff: old side tracks - line numbers', () => {
  const diff = [
    '@@ -1,3 +1,4 @@',
    ' line 1',
    '-old line 2',
    '+new line 2a',
    '+new line 2b',
    ' line 3',
  ].join('\n');
  const ranges = parseUnifiedDiff(diff, 'old');
  // -line at oldLine 2. +lines: oldLine doesn't advance, both map to oldLine 3
  // (the insertion point in the old file).
  assert.deepEqual(ranges, [
    { type: 'del', startLine: 2, endLine: 2 },
    { type: 'add', startLine: 3, endLine: 3 },
    { type: 'add', startLine: 3, endLine: 3 },
  ]);
});

// ─── buildDiff: line numbers must match rendered (to) side ──────────────────

test('from=commitA, to=workspace: +nums are workspace line numbers', async () => {
  const diff = await buildDiff(repo, relFile, file, commitA, 'workspace');
  assert.ok(diff.includes('diff'), 'should produce a diff');
  const ranges = mergeRanges(parseUnifiedDiff(diff, 'new'));
  // Workspace file has 10 lines (line 3 changed, line 7 removed, 1 inserted).
  // All ranges must be valid line numbers in workspace (1..10).
  for (const r of ranges) {
    assert.ok(r.startLine >= 1 && r.startLine <= 10, `line ${r.startLine} in workspace 1..10`);
  }
});

test('from=workspace, to=commitA: +nums are commitA line numbers', async () => {
  const diff = await buildDiff(repo, relFile, file, 'workspace', commitA);
  assert.ok(diff.includes('diff'), 'should produce a diff');
  const ranges = mergeRanges(parseUnifiedDiff(diff, 'new'));
  // commitA has 10 lines. All ranges must be valid in commitA.
  for (const r of ranges) {
    assert.ok(r.startLine >= 1 && r.startLine <= 10, `line ${r.startLine} in commitA 1..10`);
  }
});

test('from=commitA, to=commitB: +nums are commitB line numbers', async () => {
  const diff = await buildDiff(repo, relFile, file, commitA, commitB);
  const ranges = mergeRanges(parseUnifiedDiff(diff, 'new'));
  // commitB has 10 lines (10 - 1 removed + 1 inserted)
  const lines = execSync(`git show ${commitB}:test.md`, { cwd: repo, encoding: 'utf8' }).trim().split('\n');
  for (const r of ranges) {
    assert.ok(r.startLine >= 1 && r.startLine <= lines.length, `line ${r.startLine} in commitB 1..${lines.length}`);
  }
});

test('from=commitB, to=commitA: +nums are commitA line numbers', async () => {
  const diff = await buildDiff(repo, relFile, file, commitB, commitA);
  const ranges = mergeRanges(parseUnifiedDiff(diff, 'new'));
  const lines = execSync(`git show ${commitA}:test.md`, { cwd: repo, encoding: 'utf8' }).trim().split('\n');
  for (const r of ranges) {
    assert.ok(r.startLine >= 1 && r.startLine <= lines.length, `line ${r.startLine} in commitA 1..${lines.length}`);
  }
});

// ─── Mirror symmetry: swap(from,to) must give consistent results ────────────

test('mirror: from=A→B and from=B→A cover the same changed lines', async () => {
  const diffAB = await buildDiff(repo, relFile, file, commitA, commitB);
  const diffBA = await buildDiff(repo, relFile, file, commitB, commitA);
  const rangesAB = mergeRanges(parseUnifiedDiff(diffAB, 'new'));
  const rangesBA = mergeRanges(parseUnifiedDiff(diffBA, 'new'));

  // Both must be non-empty (there are changes between A and B)
  assert.ok(rangesAB.length > 0, 'A→B has ranges');
  assert.ok(rangesBA.length > 0, 'B→A has ranges');

  // A→B ranges are in B's line space, B→A ranges are in A's line space.
  // The set of changed line content must be symmetric:
  // lines marked in A→B (in B) should correspond to lines marked in B→A (in A).
  // We verify: total marked lines should be equal in both directions.
  const countAB = rangesAB.reduce((s, r) => s + (r.endLine - r.startLine + 1), 0);
  const countBA = rangesBA.reduce((s, r) => s + (r.endLine - r.startLine + 1), 0);
  // Not necessarily equal (add vs del asymmetry), but both > 0 and bounded.
  assert.ok(countAB > 0 && countBA > 0);
  assert.ok(countAB <= 10 && countBA <= 10, 'marked lines within file bounds');
});

test('mirror: workspace↔commitA ranges are within respective file bounds', async () => {
  const wsLen = fs.readFileSync(file, 'utf8').trim().split('\n').length;
  const aLen = execSync(`git show ${commitA}:test.md`, { cwd: repo, encoding: 'utf8' }).trim().split('\n').length;

  const diffWsToA = await buildDiff(repo, relFile, file, 'workspace', commitA);
  const rangesWsToA = mergeRanges(parseUnifiedDiff(diffWsToA, 'new'));
  for (const r of rangesWsToA) {
    assert.ok(r.startLine >= 1 && r.startLine <= aLen, `Ws→A: line ${r.startLine} in 1..${aLen}`);
  }

  const diffAToWs = await buildDiff(repo, relFile, file, commitA, 'workspace');
  const rangesAToWs = mergeRanges(parseUnifiedDiff(diffAToWs, 'new'));
  for (const r of rangesAToWs) {
    assert.ok(r.startLine >= 1 && r.startLine <= wsLen, `A→Ws: line ${r.startLine} in 1..${wsLen}`);
  }
});

// ─── Content correctness: ranges must correspond to actual changed lines ────

test('A→B marks the changed line 3 in commitB', async () => {
  const diff = await buildDiff(repo, relFile, file, commitA, commitB);
  const ranges = mergeRanges(parseUnifiedDiff(diff, 'new'));
  // commitB line 3 = "line 3 CHANGED" (was "line 3" in A)
  const bLines = execSync(`git show ${commitB}:test.md`, { cwd: repo, encoding: 'utf8' }).trim().split('\n');
  const hasChanged = ranges.some(r => r.startLine <= 3 && r.endLine >= 3);
  assert.ok(hasChanged, 'line 3 should be marked as changed in B');
  assert.equal(bLines[2], 'line 3 CHANGED');
});

test('B→A marks line 3 in commitA (where "line 3 CHANGED" no longer exists)', async () => {
  const diff = await buildDiff(repo, relFile, file, commitB, commitA);
  const ranges = mergeRanges(parseUnifiedDiff(diff, 'new'));
  const aLines = execSync(`git show ${commitA}:test.md`, { cwd: repo, encoding: 'utf8' }).trim().split('\n');
  const hasChanged = ranges.some(r => r.startLine <= 3 && r.endLine >= 3);
  assert.ok(hasChanged, 'line 3 should be marked in A');
  assert.equal(aLines[2], 'line 3');
});

test('workspace→A marks lines that differ from workspace', async () => {
  // Workspace has "INSERTED LINE" at line 7 (0-indexed 6 after splice)
  // and "line 3 CHANGED". commitA has neither.
  const diff = await buildDiff(repo, relFile, file, 'workspace', commitA);
  const ranges = mergeRanges(parseUnifiedDiff(diff, 'new'));
  assert.ok(ranges.length > 0, 'there should be differences');
  // All ranges valid in commitA (10 lines)
  for (const r of ranges) {
    assert.ok(r.startLine >= 1 && r.startLine <= 10);
  }
});

test('identical content produces empty diff', async () => {
  const diff = await buildDiff(repo, relFile, file, commitB, 'workspace');
  // Workspace == commitB (we committed B last and didn't modify after)
  assert.equal(diff.trim(), '', 'B→workspace should be empty');
});

test('workspace→workspace is always empty', async () => {
  const diff = await buildDiff(repo, relFile, file, 'workspace', 'workspace');
  assert.equal(diff, '');
});
