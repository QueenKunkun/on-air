import { h } from 'preact';
import { useEffect } from 'preact/hooks';
import { buildTocTree, buildTocHeader, initMasterToggle, bindTocInteractions, buildRelatedLinks } from '../../templates/toc-common';

interface TOCProps {
	contentEl: HTMLElement | null;
	fullPath: string;
	relPath: string;
	contentVersion: number;
}

export function TOC({ contentEl, fullPath, relPath, contentVersion }: TOCProps) {
	useEffect(() => {
		const toc = document.getElementById('toc') as HTMLElement;
		if (!toc || !contentEl) return;

		// Clear previous content
		while (toc.firstChild) toc.removeChild(toc.firstChild);

		const title = document.title.replace(/ \u00b7 OnAir$/, '');
		const hs = contentEl.querySelectorAll('h1,h2,h3,h4,h5,h6');
		toc.classList.toggle('no-tree', hs.length < 2);

		const master = buildTocHeader(toc, title, fullPath, relPath);

		if (hs.length >= 2) {
			const listDiv = document.createElement('div');
			listDiv.id = 'toc-list';
			toc.appendChild(listDiv);
			buildTocTree(hs, listDiv);
			initMasterToggle(toc, master);
			bindTocInteractions(toc, contentEl);
		}

		buildRelatedLinks(toc, contentEl);
	}, [contentEl, fullPath, relPath, contentVersion]);

	return null;
}
