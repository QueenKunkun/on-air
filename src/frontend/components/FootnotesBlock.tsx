import { h } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';

interface FootnotesBlockProps {
	contentEl: HTMLElement | null;
}

export function FootnotesBlock({ contentEl }: FootnotesBlockProps) {
	const [collapsed, setCollapsed] = useState(() =>
		localStorage.getItem('onair-footnotes-collapsed') === '1'
	);
	const blockRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!contentEl) return;
		const sec = contentEl.querySelector('section.footnotes');
		if (!sec) return;
		const sep = contentEl.querySelector('hr.footnotes-sep');
		if (sep) sep.parentNode?.removeChild(sep);
		const block = blockRef.current;
		if (!block) return;
		sec.parentNode?.insertBefore(block, sec);
		block.appendChild(sec);
	}, [contentEl]);

	useEffect(() => {
		localStorage.setItem('onair-footnotes-collapsed', collapsed ? '1' : '0');
	}, [collapsed]);

	if (!contentEl) return null;
	const sec = contentEl.querySelector('section.footnotes');
	if (!sec) return null;

	return (
		<div ref={blockRef} id="footnotes-block" class={collapsed ? 'collapsed' : ''}>
			<div id="footnotes-head" onClick={() => setCollapsed(!collapsed)}>
				<button class="fn-toggle" type="button">
					{collapsed ? '\u25B8' : '\u25BE'}
				</button>
				<span>Footnotes</span>
			</div>
		</div>
	);
}
