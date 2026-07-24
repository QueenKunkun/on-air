import { h } from 'preact';

export interface TocEntry {
	id: string;
	text: string;
	level: number;
	children: TocEntry[];
}

interface TocNodeProps {
	entry: TocEntry;
	collapsedAll: boolean;
}

export function TocNode({ entry, collapsedAll }: TocNodeProps) {
	const hasChildren = entry.children.length > 0;
	const collapsed = collapsedAll;

	return (
		<li>
			<div class="r">
				{hasChildren ? (
					<button class="t" title={collapsed ? 'Expand' : 'Collapse'}>{collapsed ? '+' : '\u2212'}</button>
				) : (
					<span class="s"></span>
				)}
				<a href={'#' + entry.id} title={entry.text}>{entry.text}</a>
			</div>
			{hasChildren && (
				<ul class={collapsed ? 'c' : undefined}>
					{entry.children.map(child => (
						<TocNode key={child.id} entry={child} collapsedAll={collapsed} />
					))}
				</ul>
			)}
		</li>
	);
}

export function buildTocData(headings: Element[]): TocEntry[] {
	const root: TocEntry[] = [];
	const stack: { entries: TocEntry[]; level: number }[] = [{ entries: root, level: 0 }];

	for (const h of headings) {
		const level = +h.tagName[1];
		const text = (h.textContent || '').trim();
		const id = h.id;

		while (stack.length > 1 && stack[stack.length - 1].level >= level) stack.pop();
		const parent = stack[stack.length - 1];

		const entry: TocEntry = { id, text, level, children: [] };
		parent.entries.push(entry);
		stack.push({ entries: entry.children, level });
	}

	return root;
}
