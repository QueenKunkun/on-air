import { h } from 'preact';

interface RelatedLinksProps {
	contentEl: HTMLElement;
	tocEl: HTMLElement;
}

interface RelatedItem {
	href: string;
	label: string;
}

export function findRelatedLinks(contentEl: HTMLElement, tocEl: HTMLElement): RelatedItem[] {
	const seen: Record<string, boolean> = {};
	const items: RelatedItem[] = [];
	const anchors = contentEl.querySelectorAll('a');
	for (let i = 0; i < anchors.length; i++) {
		const a = anchors[i];
		if (tocEl.contains(a)) continue;
		const href = a.getAttribute('href') || '';
		if (href.slice(0, 2) === '//') continue;
		if (/^[a-z][a-z0-9+.-]*:|#|data:/i.test(href)) continue;
		if (!/\.(md|markdown|html?)([#?].*)?$/i.test(href)) continue;
		const key = href.replace(/^\.\//, '').replace(/[#?].*$/, '');
		if (seen[key]) continue;
		seen[key] = true;
		const label = (a.textContent || '').trim();
		items.push({ href, label });
	}
	return items;
}

export function RelatedLinks({ items }: { items: RelatedItem[] }) {
	if (!items.length) return null;
	return (
		<div id="toc-related">
			<div class="toc-related-resizer" style={{ height: '4px', cursor: 'row-resize', flexShrink: '0' }}></div>
			<div class="toc-related-h">Related</div>
			{items.map(item => (
				<a key={item.href} class="toc-related-item" href={item.href} title={item.href}>{item.label || item.href}</a>
			))}
		</div>
	);
}
