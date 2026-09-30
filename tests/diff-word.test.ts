import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUnifiedDiff, mergeRanges, diffAddedWords } from '../src/routes/diff';

// ─── Modification pairing ───────────────────────────────────────────────────

test('paired modification: add carries words, del is dropped', () => {
	const diff = [
		'@@ -2,2 +2,2 @@',
		' line 2',
		'-line 3',
		'+line 3 CHANGED',
		' line 4',
	].join('\n');
	const ranges = mergeRanges(parseUnifiedDiff(diff));
	assert.equal(ranges.length, 1);
	assert.equal(ranges[0].type, 'add');
	assert.equal(ranges[0].startLine, 3);
	assert.ok(ranges[0].words?.includes('CHANGED'), `words: ${JSON.stringify(ranges[0].words)}`);
});

test('unpaired deletion keeps a plain del range', () => {
	const diff = [
		'@@ -1,2 +1,1 @@',
		'-gone one',
		'-gone two',
		' ctx',
	].join('\n');
	const ranges = mergeRanges(parseUnifiedDiff(diff));
	assert.ok(ranges.length > 0);
	assert.ok(ranges.every(r => r.type === 'del'));
	assert.ok(ranges.every(r => !r.words?.length));
});

test('unpaired addition keeps a plain add range without words', () => {
	const diff = [
		'@@ -1,1 +1,2 @@',
		' ctx',
		'+brand new',
	].join('\n');
	const ranges = mergeRanges(parseUnifiedDiff(diff));
	assert.equal(ranges.length, 1);
	assert.equal(ranges[0].type, 'add');
	assert.ok(!ranges[0].words?.length);
});

test('multi-line modification pairs in order', () => {
	const diff = [
		'@@ -1,2 +1,2 @@',
		'-old alpha',
		'-old beta',
		'+new alpha',
		'+new beta',
	].join('\n');
	const ranges = mergeRanges(parseUnifiedDiff(diff));
	assert.equal(ranges.length, 1, 'consecutive paired adds merge into one range');
	assert.equal(ranges[0].type, 'add');
	assert.deepEqual([ranges[0].startLine, ranges[0].endLine], [1, 2]);
	assert.ok(ranges[0].words?.length, 'merged range keeps words');
});

test('mergeRanges concatenates words of merged adds', () => {
	const merged = mergeRanges([
		{ type: 'add', startLine: 3, endLine: 3, words: ['CHANGED'] },
		{ type: 'add', startLine: 4, endLine: 4, words: ['INSERTED'] },
	]);
	assert.equal(merged.length, 1);
	assert.deepEqual(merged[0].words, ['CHANGED', 'INSERTED']);
});

// ─── diffAddedWords ─────────────────────────────────────────────────────────

test('diffAddedWords: identical lines give no words', () => {
	assert.deepEqual(diffAddedWords('same line', 'same line'), []);
});

test('diffAddedWords: English change yields the new word', () => {
	const words = diffAddedWords('line 3', 'line 3 CHANGED');
	assert.ok(words.includes('CHANGED'), `words: ${JSON.stringify(words)}`);
});

test('diffAddedWords: Chinese change yields word granularity, not the sentence', () => {
	const words = diffAddedWords('平台内置A版本化', '平台内置B版本化');
	assert.ok(words.includes('B'), `words: ${JSON.stringify(words)}`);
	assert.ok(
		!words.some(w => w.includes('平台内置')),
		`must not mark the whole sentence: ${JSON.stringify(words)}`,
	);
});
