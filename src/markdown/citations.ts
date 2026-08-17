import type MarkdownIt from 'markdown-it';

/**
 * IEEE-style numeric citations, e.g. `[3]`, `[2, 7]`, `[8-10]`.
 *
 * Reference entries are paragraphs inside a References / Bibliography /
 * 参考文献 section that start with a bare `[N]` marker (e.g. `[3] B. Burns, ...`).
 * Each entry gets an `id="ref-N"` anchor, and matching citations in body text
 * are turned into links to those anchors. A citation is only converted when
 * EVERY number it references has a matching entry, so prose like `[0, 1]` or
 * `[key]` is left untouched.
 */

const REFS_HEADING_RE = /^(?:#{1,6})\s*(references|bibliography|参考文献)/i;
const REF_ENTRY_RE = /^\[(\d+)\](?::)?\s/;
const CITATION_RE = /^\[(\d+(?:\s*[,-]\s*\d+)*)\]/;

/** Expand a citation body like `2, 7` or `8-10` into individual numbers. */
function parseCitation(inner: string): number[] | null {
	const nums: number[] = [];
	for (const part of inner.split(',')) {
		const trimmed = part.trim();
		const range = trimmed.match(/^(\d+)\s*-\s*(\d+)$/);
		if (range) {
			const a = Number(range[1]);
			const b = Number(range[2]);
			if (a > b) { return null; }
			for (let n = a; n <= b; n++) { nums.push(n); }
		} else if (/^\d+$/.test(trimmed)) {
			nums.push(Number(trimmed));
		} else {
			return null;
		}
	}
	return nums;
}

/** Collect reference numbers defined in the References section of the source. */
function collectRefNumbers(src: string): Set<number> {
	const refs = new Set<number>();
	const lines = src.split('\n');
	let inRefs = false;
	for (const line of lines) {
		if (!inRefs) {
			if (REFS_HEADING_RE.test(line)) { inRefs = true; }
			continue;
		}
		const m = line.match(REF_ENTRY_RE);
		if (m) { refs.add(Number(m[1])); }
	}
	return refs;
}

/**
 * markdown-it plugin adding IEEE numeric citation support.
 */
export default function citationsPlugin(md: MarkdownIt): void {
	// Scan the whole source for reference definitions before inline parsing
	// runs, so the inline rule can decide which `[N]` are real citations.
	md.core.ruler.before('inline', 'onair_collect_refs', (state) => {
		state.env.onairRefs = collectRefNumbers(state.src);
	});

	md.inline.ruler.after('image', 'onair_citation', (state, silent) => {
		const refs: Set<number> | undefined = state.env.onairRefs;
		if (!refs || refs.size === 0) { return false; }
		const start = state.pos;
		const src = state.src;
		if (src[start] !== '[') { return false; }
		const m = CITATION_RE.exec(src.slice(start));
		if (!m) { return false; }
		const nums = parseCitation(m[1]);
		if (!nums || !nums.every((n) => refs.has(n))) { return false; }
		if (silent) { return true; }

		// `[<a href="#ref-N">N</a>, ...]` — preserve the original separator text.
		const push = (type: string, tag: string, nesting: 1 | 0 | -1, content?: string) => {
			const t = state.push(type, tag, nesting);
			if (content !== undefined) { t.content = content; }
			return t;
		};
		push('text', '', 0, '[');
		let last = 0;
		for (const mm of m[1].matchAll(/\d+/g)) {
			if (mm.index > last) { push('text', '', 0, m[1].slice(last, mm.index)); }
			const n = Number(mm[0]);
			const link = push('link_open', 'a', 1);
			link.attrSet('href', `#ref-${n}`);
			link.attrSet('class', 'onair-citation');
			push('text', '', 0, mm[0]);
			push('link_close', 'a', -1);
			last = mm.index + mm[0].length;
		}
		if (last < m[1].length) { push('text', '', 0, m[1].slice(last)); }
		push('text', '', 0, ']');
		state.pos = start + m[0].length;
		return true;
	});

	// Give each reference entry paragraph its `ref-N` anchor.
	md.core.ruler.push('onair_ref_anchors', (state) => {
		const refs: Set<number> | undefined = state.env.onairRefs;
		if (!refs || refs.size === 0) { return; }
		const tokens = state.tokens;
		let inRefs = false;
		for (let i = 0; i < tokens.length; i++) {
			const t = tokens[i];
			if (t.type === 'heading_open') {
				const inline = tokens[i + 1];
				const text = inline && inline.type === 'inline' ? inline.content : '';
				if (REFS_HEADING_RE.test(`# ${text.trim()}`)) {
					inRefs = true;
				} else if (inRefs) {
					inRefs = false;
				}
				continue;
			}
			if (inRefs && t.type === 'paragraph_open') {
				const inline = tokens[i + 1];
				if (inline && inline.type === 'inline') {
					const m = inline.content.match(/^\[(\d+)\]/);
					if (m && refs.has(Number(m[1]))) {
						t.attrSet('id', `ref-${m[1]}`);
					}
				}
			}
		}
	});
}