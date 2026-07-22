import { h } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { buildTocTree, buildTocHeader, initMasterToggle, bindTocInteractions, buildRelatedLinks } from '../../templates/toc-common';

interface TOCProps {
	contentEl: HTMLElement | null;
	fullPath: string;
	relPath: string;
}

export function TOC({ contentEl, fullPath, relPath }: TOCProps) {
	const tocRef = useRef<HTMLElement | null>(null);

	useEffect(() => {
		const toc = document.getElementById('toc') as HTMLElement;
		if (!toc) return;
		tocRef.current = toc;

		// Clear previous content
		while (toc.firstChild) toc.removeChild(toc.firstChild);

		if (!contentEl) return;

		const title = document.title.replace(/ \u00b7 OnAir$/, '');
		const hs = contentEl.querySelectorAll('h1,h2,h3,h4,h5,h6');
		toc.classList.toggle('no-tree', hs.length < 2);

		const master = buildTocHeader(toc, title, fullPath, relPath);

		if (hs.length >= 2) {
			buildTocTree(hs, toc);
			initMasterToggle(toc, master);
			bindTocInteractions(toc, contentEl);
		}

		buildRelatedLinks(toc, contentEl);
	}, [contentEl, fullPath, relPath]);

	return null; // TOC renders imperatively into #toc
}
