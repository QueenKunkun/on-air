import { h } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { Layout } from './components/Layout';
import { Banner } from './components/Banner';
import { TOC } from './components/TOC';
import { Annotations } from './components/Annotations';
import { useWebSocket } from './hooks/useWebSocket';

export function App() {
	const [contentEl, setContentEl] = useState<HTMLElement | null>(null);
	const [fullPath, setFullPath] = useState(window.__ONAIR__?.fullPath || '');
	const [relPath, setRelPath] = useState(window.__ONAIR__?.relPath || '');

	const processFootnotes = useCallback((el: HTMLElement) => {
		const sec = el.querySelector('section.footnotes');
		if (!sec) return;
		const sep = el.querySelector('hr.footnotes-sep');
		if (sep) sep.parentNode?.removeChild(sep);
		const block = document.createElement('div');
		block.id = 'footnotes-block';
		const head = document.createElement('div');
		head.id = 'footnotes-head';
		const toggle = document.createElement('button');
		toggle.className = 'fn-toggle';
		toggle.type = 'button';
		const title = document.createElement('span');
		title.textContent = 'Footnotes';
		head.appendChild(toggle);
		head.appendChild(title);
		sec.parentNode?.insertBefore(block, sec);
		block.appendChild(head);
		block.appendChild(sec);
		function setCollapsed(c: boolean) {
			block.classList.toggle('collapsed', c);
			toggle.textContent = c ? '\u25B8' : '\u25BE';
			localStorage.setItem('onair-footnotes-collapsed', c ? '1' : '0');
		}
		setCollapsed(localStorage.getItem('onair-footnotes-collapsed') === '1');
		head.onclick = () => setCollapsed(!block.classList.contains('collapsed'));
	}, []);

	const handleUpdate = useCallback((msg: { html?: string; title?: string; fullPath?: string; relPath?: string }) => {
		const content = document.getElementById('content');
		if (!content) return;
		if (msg.html != null) content.innerHTML = msg.html;
		if (msg.fullPath) setFullPath(msg.fullPath);
		if (msg.relPath != null) setRelPath(msg.relPath);
		if (msg.title) document.title = msg.title + ' \u00b7 OnAir';
		setContentEl(content);
		processFootnotes(content);
		// Rebuild TOC by triggering a re-render
		forceUpdate();
	}, [processFootnotes]);

	const [, forceUpdate] = useState(0);

	useWebSocket(handleUpdate);

	// Initial mount
	useEffect(() => {
		const content = document.getElementById('content');
		if (content) {
			setContentEl(content);
			processFootnotes(content);
		}
	}, []);

	return h(Layout, null,
		h(Banner, null),
		h(TOC, { contentEl, fullPath, relPath }),
		h(Annotations, { contentEl }),
	);
}
