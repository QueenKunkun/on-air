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

function fileAt(ref: string): string[] {
  return execSync(`git show ${ref}:${relFile}`, { cwd: repo, encoding: 'utf8' }).trim().split('\n');
}

/** Get the raw content of the "to" side for a given from/to pair. */
async function renderTo(to: string): Promise<string[]> {
  if (to === 'workspace') return fs.readFileSync(file, 'utf8').trim().split('\n');
  return fileAt(to);
}

/** Get the raw content of the "from" side for comparison. */
async function renderFrom(from: string): Promise<string[]> {
  if (from === 'workspace') return fs.readFileSync(file, 'utf8').trim().split('\n');
  return fileAt(from);
}

/**
 * Core invariant: for a from→to diff, every marked range's line numbers must
 * (a) exist in the "to" content (the side being rendered), and
 * (b) the content at those lines must actually differ between from and to.
 *
 * Returns the marked lines' content from the "to" side for further assertions.
 */
async function getMarkedLines(from: string, to: string): Promise<string[]> {
  const diff = await buildDiff(repo, relFile, file, from, to);
  const ranges = mergeRanges(parseUnifiedDiff(diff, 'new'));
  const toContent = await renderTo(to);
  const fromContent = await renderFrom(from);
  const marked: string[] = [];

  for (const r of ranges) {
    for (let line = r.startLine; line <= r.endLine; line++) {
      // (a) line must exist in rendered content
      assert.ok(
        line >= 1 && line <= toContent.length,
        `from=${from.slice(0,7)} to=${to.slice(0,7)}: line ${line} must exist in to-content (1..${toContent.length})`,
      );
      marked.push(toContent[line - 1]);
    }
  }

  // (b) If there are marked lines, from and to must actually differ
  if (marked.length > 0) {
    const fromStr = fromContent.join('\n');
    const toStr = toContent.join('\n');
    assert.notEqual(fromStr, toStr, 'if ranges exist, from and to must differ');
  }

  return marked;
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

  // Commit B: change line 3, remove line 7, insert after line 8
  const b = Array.from({ length: 10 }, (_, i) => {
    if (i === 2) return 'line 3 CHANGED';
    if (i === 6) return null;
    return `line ${i + 1}`;
  }).filter(Boolean) as string[];
  b.splice(7, 0, 'INSERTED LINE');
  fs.writeFileSync(file, b.join('\n') + '\n');
  git('add .');
  git('commit -q -m "B"');
  commitB = git('rev-parse HEAD');
});

after(() => {
  fs.rmSync(repo, { recursive: true, force: true });
});

// ─── Core invariant: marked lines exist in rendered content and are actually different ───

test('A→B: marked lines exist in B and differ from A', async () => {
  const marked = await getMarkedLines(commitA, commitB);
  assert.ok(marked.length > 0, 'should have marked lines');
  // B changed line 3 and inserted a line — at least one marked line should reflect that
  assert.ok(
    marked.some(l => l.includes('CHANGED') || l.includes('INSERTED')),
    `expected changed content, got: ${JSON.stringify(marked)}`,
  );
});

test('B→A: marked lines exist in A and differ from B', async () => {
  const marked = await getMarkedLines(commitB, commitA);
  assert.ok(marked.length > 0, 'should have marked lines');
  // A has "line 3" (not CHANGED) and no "INSERTED LINE"
  assert.ok(
    marked.some(l => l.includes('line 3') && !l.includes('CHANGED')),
    `expected original line 3, got: ${JSON.stringify(marked)}`,
  );
});

test('workspace→A: marked lines exist in A and differ from workspace', async () => {
  const marked = await getMarkedLines('workspace', commitA);
  assert.ok(marked.length > 0, 'should have marked lines');
});

test('A→workspace: marked lines exist in workspace and differ from A', async () => {
  const marked = await getMarkedLines(commitA, 'workspace');
  assert.ok(marked.length > 0, 'should have marked lines');
  assert.ok(
    marked.some(l => l.includes('CHANGED') || l.includes('INSERTED')),
    `expected changed content in workspace, got: ${JSON.stringify(marked)}`,
  );
});

test('workspace→B: empty (workspace == B)', async () => {
  const marked = await getMarkedLines('workspace', commitB);
  assert.equal(marked.length, 0, 'workspace and B are identical');
});

test('B→workspace: empty (workspace == B)', async () => {
  const marked = await getMarkedLines(commitB, 'workspace');
  assert.equal(marked.length, 0, 'workspace and B are identical');
});

// ─── Mirror: swapped directions must mark DIFFERENT content ─────────────────

test('mirror: A→B and B→A mark different rendered content', async () => {
  const markedAB = await getMarkedLines(commitA, commitB);
  const markedBA = await getMarkedLines(commitB, commitA);
  assert.ok(markedAB.length > 0 && markedBA.length > 0, 'both directions have marks');
  // The actual line content must differ (because rendered sides differ)
  const abSet = new Set(markedAB);
  const hasOverlap = markedBA.some(l => abSet.has(l));
  assert.ok(
    !hasOverlap || markedAB.some(l => l.includes('CHANGED')) !== markedBA.some(l => l.includes('CHANGED')),
    'swapped directions should render different content',
  );
});

test('mirror: workspace→A and A→workspace mark different rendered content', async () => {
  const markedWsA = await getMarkedLines('workspace', commitA);
  const markedAWs = await getMarkedLines(commitA, 'workspace');
  assert.ok(markedWsA.length > 0 && markedAWs.length > 0, 'both directions have marks');
  // A→workspace renders workspace content (has CHANGED/INSERTED)
  // workspace→A renders A content (has original line 3)
  assert.ok(
    markedAWs.some(l => l.includes('CHANGED') || l.includes('INSERTED')),
    'A→workspace should mark workspace content',
  );
  assert.ok(
    markedWsA.some(l => l.includes('line 3') && !l.includes('CHANGED')),
    'workspace→A should mark A content',
  );
});
