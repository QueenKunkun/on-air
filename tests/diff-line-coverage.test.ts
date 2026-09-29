import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverLine } from '../src/frontend/diffLineMap';

let renderMarkdown: (src: string, docDir: string, rootDir: string) => string;

test('load renderer module', async () => {
	const mod = await import('../src/markdown/renderer.ts');
	renderMarkdown = mod.renderMarkdown;
	assert.ok(renderMarkdown, 'renderMarkdown loaded');
});

// ─── coverLine ───────────────────────────────────────────────────────────────

test('coverLine: exact single-line block', () => {
	assert.equal(coverLine([{ start: 5, end: 5 }], 5), 0);
	assert.equal(coverLine([{ start: 5, end: 5 }], 6), -1);
});

test('coverLine: nested blocks prefer the smallest span', () => {
	// ul[10,14] contains li[12,12]; line 12 must map to the li, not the ul
	const blocks = [
		{ start: 10, end: 14 },
		{ start: 12, end: 12 },
	];
	assert.equal(coverLine(blocks, 12), 1);
	assert.equal(coverLine(blocks, 11), 0);
});

test('coverLine: mid-paragraph line matches its block', () => {
	assert.equal(coverLine([{ start: 3, end: 5 }], 4), 0);
});

test('coverLine: uncovered line returns -1', () => {
	assert.equal(coverLine([{ start: 1, end: 2 }, { start: 5, end: 6 }], 4), -1);
});

// ─── Rendered HTML must cover every content line ────────────────────────────
// Regression test: a file whose changes fall inside a list item and a table
// row showed "No changes", because only level-0 block starts were annotated.

const FIXTURE = [
	'# Roadmap',
	'',
	'Intro paragraph line one',
	'continued line two MARK-A',
	'continued line three',
	'',
	'- first bullet',
	'- second bullet MARK-B',
	'- third bullet',
	'',
	'Some text before table.',
	'',
	'| head a | head b |',
	'| --- | --- |',
	'| row one a | row one b |',
	'| row two MARK-C | row two b |',
	'',
	'Final paragraph.',
].join('\n');

interface Span { start: number; end: number; }

function extractSpans(html: string): Span[] {
	const spans: Span[] = [];
	const tagRe = /<[^>]*data-src-line="(\d+)"[^>]*>/g;
	let m: RegExpExecArray | null;
	while ((m = tagRe.exec(html)) !== null) {
		const endM = /data-src-line-end="(\d+)"/.exec(m[0]);
		const start = parseInt(m[1], 10);
		const end = endM ? parseInt(endM[1], 10) : start;
		spans.push({ start, end });
	}
	return spans;
}

function lineOf(marker: string): number {
	const idx = FIXTURE.split('\n').findIndex(l => l.includes(marker));
	assert.ok(idx >= 0, `marker ${marker} present in fixture`);
	return idx + 1; // 1-indexed source line
}

test('changed lines inside paragraph/list/table are covered by rendered blocks', () => {
	const html = renderMarkdown(FIXTURE, '/doc', '/root');
	const spans = extractSpans(html);
	assert.ok(spans.length > 0, 'annotated blocks exist');
	for (const marker of ['MARK-A', 'MARK-B', 'MARK-C']) {
		const line = lineOf(marker);
		const idx = coverLine(spans, line);
		assert.ok(idx >= 0, `line ${line} (${marker}) must be covered by a rendered block`);
	}
});

test('every non-blank content line is covered', () => {
	const html = renderMarkdown(FIXTURE, '/doc', '/root');
	const spans = extractSpans(html);
	const lines = FIXTURE.split('\n');
	const uncovered: number[] = [];
	lines.forEach((text, i) => {
		if (text.trim() === '') return; // blank lines belong to no block
		if (coverLine(spans, i + 1) < 0) uncovered.push(i + 1);
	});
	assert.deepEqual(uncovered, [], `all content lines covered, uncovered: ${uncovered}`);
});
