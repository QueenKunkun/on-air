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
