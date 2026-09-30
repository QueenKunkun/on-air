/** A rendered block covering source lines [start, end] (both 1-indexed, inclusive). */
export interface LineBlock {
	start: number;
	end: number;
}

/**
 * Index of the smallest block covering `line`, or -1 if none covers it.
 * Blocks nest (e.g. a list contains its items), so the smallest span wins —
 * the changed line highlights its nearest block, not a distant ancestor.
 */
export function coverLine(blocks: LineBlock[], line: number): number {
	let best = -1;
	let bestSpan = Infinity;
	for (let i = 0; i < blocks.length; i++) {
		const b = blocks[i];
		if (b.start <= line && line <= b.end) {
			const span = b.end - b.start;
			if (span < bestSpan) {
				bestSpan = span;
				best = i;
			}
		}
	}
	return best;
}

const ASCII_RE = /^[\x00-\x7F]+$/;

function isWordChar(ch: string): boolean {
	return /[\p{L}\p{N}_]/u.test(ch);
}

// Wrap occurrences of added words inside a block with .diff-word-add spans.
// ASCII words require boundary checks (avoid matching inside larger words);
// CJK substrings match directly since characters carry no boundaries.
export function wrapAddedWords(block: Element, words: string[]): void {
	for (const raw of words) {
		const word = raw.trim();
		if (!word) continue;
		const ascii = ASCII_RE.test(word);
		const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
		const nodes: Text[] = [];
		let n: Node | null;
		while ((n = walker.nextNode())) {
			const t = n as Text;
			if (t.parentElement?.closest('.diff-word-add')) continue;
			nodes.push(t);
		}
		for (const node of nodes) wrapWordInNode(node, word, ascii);
	}
}

function wrapWordInNode(node: Text, word: string, ascii: boolean): void {
	const text = node.textContent ?? '';
	let idx = 0;
	const at: number[] = [];
	while (true) {
		const i = text.indexOf(word, idx);
		if (i < 0) break;
		if (!ascii || isWordBoundary(text, i, word.length)) at.push(i);
		idx = i + word.length;
	}
	// Split back-to-front so earlier offsets stay valid.
	for (let k = at.length - 1; k >= 0; k--) {
		const i = at[k];
		node.splitText(i + word.length);
		const mid = node.splitText(i);
		const span = document.createElement('span');
		span.className = 'diff-word-add';
		span.textContent = mid.textContent;
		mid.replaceWith(span);
	}
}

function isWordBoundary(text: string, i: number, len: number): boolean {
	const before = i > 0 ? text[i - 1] : '';
	const after = i + len < text.length ? text[i + len] : '';
	return !isWordChar(before) && !isWordChar(after);
}

/** Remove word-highlight spans, restoring plain text. */
export function unwrapAddedWords(root: ParentNode): void {
	root.querySelectorAll('.diff-word-add').forEach(el => {
		el.replaceWith(document.createTextNode(el.textContent ?? ''));
	});
}
