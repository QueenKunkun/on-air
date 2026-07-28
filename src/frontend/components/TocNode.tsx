import { h } from 'preact';
import { useState, useCallback } from 'preact/hooks';

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
	const [localCollapsed, setLocalCollapsed] = useState(false);
	const collapsed = collapsedAll || localCollapsed;

	const toggle = useCallback((e: Event) => {
		e.preventDefault();
		e.stopPropagation();
		setLocalCollapsed(prev => !prev);
	}, []);

	return (
		<li data-collapsed={hasChildren && collapsed ? '' : undefined}>
			<div class="r" data-testid="toc-row">
				{hasChildren ? (
					<button class="t" data-testid="toc-toggle" title={collapsed ? 'Expand' : 'Collapse'} onClick={toggle}>{collapsed ? '+' : '\u2212'}</button>
				) : (
					<span class="s"></span>
				)}
				<a href={'#' + entry.id} title={entry.text}>{entry.text}</a>
			</div>
			{hasChildren && (
				<ul class={collapsed ? 'c' : undefined} data-collapsed={collapsed ? '' : undefined}>
					{entry.children.map(child => (
						<TocNode key={child.id} entry={child} collapsedAll={collapsedAll} />
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
