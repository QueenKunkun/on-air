import { h } from 'preact';
import { useState, useEffect, useRef, useMemo } from 'preact/hooks';
import { TocHeader } from './TocHeader';
import { TocNode, buildTocData, type TocEntry } from './TocNode';
import { RelatedLinks, findRelatedLinks } from './RelatedLinks';
import { useScrollSpy } from '../hooks/useScrollSpy';

interface TOCProps {
	contentEl: HTMLElement | null;
	fullPath: string;
	relPath: string;
	contentVersion: number;
}

export function TOC({ contentEl, fullPath, relPath, contentVersion }: TOCProps) {
	const [collapsedAll, setCollapsedAll] = useState(false);
	const [tocEntries, setTocEntries] = useState<TocEntry[]>([]);
	const [relatedItems, setRelatedItems] = useState<{ href: string; label: string }[]>([]);
	const [hasHeadings, setHasHeadings] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	const [tocListNode, setTocListNode] = useState<HTMLDivElement | null>(null);
	const tocListCb = (node: HTMLDivElement | null) => { setTocListNode(node); };

	useEffect(() => {
		if (!contentEl) return;

		const hs = contentEl.querySelectorAll('h1,h2,h3,h4,h5,h6');
		setHasHeadings(hs.length >= 2);
		setTocEntries(buildTocData(Array.from(hs)));
		setRelatedItems(findRelatedLinks(contentEl, contentEl));

		// Toggle no-tree class
		const toc = document.getElementById('toc');
		if (toc) toc.classList.toggle('no-tree', hs.length < 2);
	}, [contentEl, contentVersion]);

	const title = useMemo(() => document.title.replace(/ \u00b7 OnAir$/, ''), []);

	const linksRef = useRef<HTMLAnchorElement[]>([]);
	const [, forceLinks] = useState(0);
	const links = linksRef.current;

	const headings = useMemo(() => {
		if (!contentEl) return [];
		return Array.from(contentEl.querySelectorAll('h1,h2,h3,h4,h5,h6'));
	}, [contentEl, contentVersion]);

	useScrollSpy(contentEl, headings, links);

	// Compute links after DOM paint so we pick up the updated TOC anchors
	useEffect(() => {
		if (!tocListNode) { linksRef.current = []; return; }
		linksRef.current = Array.from(tocListNode.querySelectorAll('a'));
		forceLinks(n => n + 1);
	});

	// Portal-like: append rendered content to #toc
	useEffect(() => {
		const toc = document.getElementById('toc');
		const root = rootRef.current;
		if (!toc || !root) return;

		// Clear previous content
		while (toc.firstChild) toc.removeChild(toc.firstChild);
		toc.appendChild(root);

		return () => {
			if (root.parentNode === toc) toc.removeChild(root);
		};
	});

	return (
		<div ref={rootRef}>
			<TocHeader
				title={title}
				fullPath={fullPath}
				relPath={relPath}
				collapsedAll={collapsedAll}
				onToggleAll={() => setCollapsedAll(prev => !prev)}
			/>
			{hasHeadings && (
				<div id="toc-list" ref={tocListCb}>
					<ul>
						{tocEntries.map(entry => (
							<TocNode key={entry.id} entry={entry} collapsedAll={collapsedAll} />
						))}
					</ul>
				</div>
			)}
			<RelatedLinks items={relatedItems} />
		</div>
	);
}
