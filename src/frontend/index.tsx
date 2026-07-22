import { h, render } from 'preact';
import { FileTree } from './FileTree';
import { Banner } from './components/Banner';
import { Layout } from './components/Layout';
import { TOC } from './components/TOC';
import { Annotations } from './components/Annotations';
import { useWebSocket } from './hooks/useWebSocket';
import { useCallback, useEffect, useState } from 'preact/hooks';

function App() {
	const [contentEl, setContentEl] = useState<HTMLElement | null>(null);
	const [fullPath, setFullPath] = useState(window.__ONAIR__?.fullPath || '');
	const [relPath, setRelPath] = useState(window.__ONAIR__?.relPath || '');
	const [contentVersion, setContentVersion] = useState(0);

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
		if (msg.fullPath) {
			setFullPath(msg.fullPath);
			const ftRoot = document.getElementById('ft-preact-root');
			if (ftRoot) ftRoot.setAttribute('data-fullpath', msg.fullPath);
		}
		if (msg.relPath != null) setRelPath(msg.relPath);
		if (msg.title) document.title = msg.title + ' \u00b7 OnAir';
		setContentEl(content);
		processFootnotes(content);
		setContentVersion(n => n + 1);
	}, [processFootnotes]);

	useWebSocket(handleUpdate);

	useEffect(() => {
		const content = document.getElementById('content');
		if (content) {
			setContentEl(content);
			processFootnotes(content);
		}
	}, []);

	return h(Layout, null,
		h(Banner, null),
		h(TOC, { contentEl, fullPath, relPath, contentVersion }),
		h(Annotations, { contentEl, contentVersion }),
	);
}

// Mount FileTree into #ft-preact-root
const ftRoot = document.getElementById('ft-preact-root');
if (ftRoot) {
	const id = ftRoot.getAttribute('data-id') || '';
	render(h(FileTree, { id }), ftRoot);
}

// Mount App into hidden container (binds behavior to existing DOM)
const container = document.createElement('div');
container.id = 'onair-preact';
container.style.display = 'none';
document.body.appendChild(container);
render(h(App, null), container);
