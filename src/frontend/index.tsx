import { h, render } from 'preact';
import { FileTree } from './FileTree';
import { Banner } from './components/Banner';
import { Layout } from './components/Layout';
import { TOC } from './components/TOC';
import { Annotations } from './components/Annotations';
import { FootnotesBlock } from './components/FootnotesBlock';
import { ConnectionStatus } from './components/ConnectionStatus';
import { useWebSocket } from './hooks/useWebSocket';
import { useCallback, useEffect, useState } from 'preact/hooks';

function App() {
	const [contentEl, setContentEl] = useState<HTMLElement | null>(null);
	const [fullPath, setFullPath] = useState(window.__ONAIR__?.fullPath || '');
	const [relPath, setRelPath] = useState(window.__ONAIR__?.relPath || '');
	const [contentVersion, setContentVersion] = useState(0);

	const handleUpdate = useCallback((msg: { html?: string; title?: string; fullPath?: string; relPath?: string }) => {
		const content = document.getElementById('content');
		if (!content) return;
		if (msg.html != null) content.innerHTML = msg.html;
		if (msg.fullPath) setFullPath(msg.fullPath);
		if (msg.relPath != null) setRelPath(msg.relPath);
		if (msg.title) document.title = msg.title + ' \u00b7 OnAir';
		setContentEl(content);
		setContentVersion(n => n + 1);
	}, []);

	const connStatus = useWebSocket(handleUpdate);

	useEffect(() => {
		const content = document.getElementById('content');
		if (content) setContentEl(content);
	}, []);

	const banner = document.getElementById('banner');
	if (banner) {
		banner.classList.toggle('offline', connStatus.offline);
	}

	return h(Layout, null,
		h(Banner, { connStatus }),
		h(TOC, { contentEl, fullPath, relPath, contentVersion }),
		h(FootnotesBlock, { contentEl }),
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
