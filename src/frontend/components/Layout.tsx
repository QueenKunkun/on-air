import { h, Fragment } from 'preact';
import { useCallback, useEffect, useRef } from 'preact/hooks';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useResizer } from '../hooks/useResizer';
import { LS_KEYS } from '../../common/localStorageKeys';

function updateEdgeHandles() {
	const filesEl = document.getElementById('filesSide');
	const tocEl = document.getElementById('tocCol');
	const fc = filesEl ? filesEl.classList.contains('collapsed') : false;
	const tc = tocEl ? tocEl.classList.contains('collapsed') : false;
	const edgeHandles = document.getElementById('edgeHandles');
	if (edgeHandles) edgeHandles.classList.toggle('visible', fc || tc);
	const edgeFiles = document.querySelector<HTMLElement>('#edgeHandles [data-panel="files"]');
	if (edgeFiles) edgeFiles.style.display = fc ? '' : 'none';
	const edgeToc = document.querySelector<HTMLElement>('#edgeHandles [data-panel="toc"]');
	if (edgeToc) edgeToc.style.display = tc ? '' : 'none';
}

export function Layout({ children }: { children: preact.ComponentChildren }) {
	const [filesCollapsed, setFilesCollapsed] = useLocalStorage(LS_KEYS.FILES_COLLAPSED, '0');
	const [tocCollapsed, setTocCollapsed] = useLocalStorage(LS_KEYS.TOC_COLLAPSED, '0');

	const filesSideRef = useRef(document.getElementById('filesSide'));
	const tocColRef = useRef(document.getElementById('tocCol'));
	const filesResizerRef = useRef(document.getElementById('filesResizer'));
	const tocResizerRef = useRef(document.getElementById('tocResizer'));

	const fc = filesCollapsed === '1';
	const tc = tocCollapsed === '1';

	useResizer(filesResizerRef, filesSideRef, {
		axis: 'x', invert: false, key: LS_KEYS.FILES_WIDTH, def: null, min: 120, max: Infinity,
		get: (el) => el.offsetWidth,
		set: (_, v) => { document.documentElement.style.setProperty('--files-w', v + 'px'); },
	}, []);

	useResizer(tocResizerRef, tocColRef, {
		axis: 'x', invert: false, key: LS_KEYS.TOC_WIDTH, def: null, min: 120, max: Infinity,
		get: (el) => el.offsetWidth,
		set: (_, v) => { document.documentElement.style.setProperty('--toc-w', v + 'px'); },
	}, []);

	const toggleFiles = useCallback(() => {
		const next = filesCollapsed !== '1';
		setFilesCollapsed(next ? '1' : '0');
		const el = filesSideRef.current;
		if (el) el.classList.toggle('collapsed', next);
		document.documentElement.style.setProperty('--files-w', next ? '0px' : (localStorage.getItem(LS_KEYS.FILES_WIDTH) || '300') + 'px');
		document.documentElement.style.setProperty('--files-resizer-w', next ? '0px' : 'var(--resizer-w)');
		if (!next) window.dispatchEvent(new CustomEvent('onair:tree-activate'));
		updateEdgeHandles();
	}, [filesCollapsed, setFilesCollapsed]);

	const toggleToc = useCallback(() => {
		const next = tocCollapsed !== '1';
		setTocCollapsed(next ? '1' : '0');
		const el = tocColRef.current;
		if (el) el.classList.toggle('collapsed', next);
		document.documentElement.style.setProperty('--toc-w', next ? '0px' : (localStorage.getItem(LS_KEYS.TOC_WIDTH) || '200') + 'px');
		document.documentElement.style.setProperty('--toc-resizer-w', next ? '0px' : 'var(--resizer-w)');
		updateEdgeHandles();
	}, [tocCollapsed, setTocCollapsed]);

	const expandFiles = useCallback(() => {
		setFilesCollapsed('0');
		const el = filesSideRef.current;
		if (el) el.classList.remove('collapsed');
		document.documentElement.style.setProperty('--files-w', (localStorage.getItem(LS_KEYS.FILES_WIDTH) || '300') + 'px');
		document.documentElement.style.setProperty('--files-resizer-w', 'var(--resizer-w)');
		window.dispatchEvent(new CustomEvent('onair:tree-activate'));
		updateEdgeHandles();
	}, [setFilesCollapsed]);

	const expandToc = useCallback(() => {
		setTocCollapsed('0');
		const el = tocColRef.current;
		if (el) el.classList.remove('collapsed');
		document.documentElement.style.setProperty('--toc-w', (localStorage.getItem(LS_KEYS.TOC_WIDTH) || '200') + 'px');
		document.documentElement.style.setProperty('--toc-resizer-w', 'var(--resizer-w)');
		updateEdgeHandles();
	}, [setTocCollapsed]);

	// Sync collapsed classes on mount and when state changes
	useEffect(() => {
		const el = filesSideRef.current;
		if (el) el.classList.toggle('collapsed', fc);
	}, [fc]);

	useEffect(() => {
		const el = tocColRef.current;
		if (el) el.classList.toggle('collapsed', tc);
	}, [tc]);

	// Edge handles: sync on mount from DOM classes (handles pre-collapsed state from inline script)
	useEffect(() => {
		updateEdgeHandles();
	}, []);

	// Bind collapse buttons (x in panel header) and edge handle click handlers.
	const toggleFilesRef = useRef(toggleFiles);
	const toggleTocRef = useRef(toggleToc);
	const expandFilesRef = useRef(expandFiles);
	const expandTocRef = useRef(expandToc);
	toggleFilesRef.current = toggleFiles;
	toggleTocRef.current = toggleToc;
	expandFilesRef.current = expandFiles;
	expandTocRef.current = expandToc;

	useEffect(() => {
		function onCollapseFiles() {
			if (filesResizerRef.current?.getAttribute('data-dragging')) return;
			toggleFilesRef.current();
		}
		function onCollapseToc() {
			if (tocResizerRef.current?.getAttribute('data-dragging')) return;
			toggleTocRef.current();
		}

		window.addEventListener('onair:collapse-files', onCollapseFiles);
		window.addEventListener('onair:collapse-toc', onCollapseToc);

		const edgeFiles = document.querySelector<HTMLElement>('#edgeHandles [data-panel="files"]');
		const edgeToc = document.querySelector<HTMLElement>('#edgeHandles [data-panel="toc"]');
		const onExpandFiles = () => expandFilesRef.current();
		const onExpandToc = () => expandTocRef.current();
		edgeFiles?.addEventListener('click', onExpandFiles);
		edgeToc?.addEventListener('click', onExpandToc);
		return () => {
			window.removeEventListener('onair:collapse-files', onCollapseFiles);
			window.removeEventListener('onair:collapse-toc', onCollapseToc);
			edgeFiles?.removeEventListener('click', onExpandFiles);
			edgeToc?.removeEventListener('click', onExpandToc);
		};
	}, []);

	// Hydrate CSS variables from initial DOM widths
	useEffect(() => {
		const filesEl = filesSideRef.current;
		const tocEl = tocColRef.current;
		if (filesEl) {
			document.documentElement.style.setProperty('--files-w', filesEl.offsetWidth + 'px');
		}
		if (tocEl) {
			document.documentElement.style.setProperty('--toc-w', tocEl.offsetWidth + 'px');
		}
	}, []);

	return h(Fragment, null, children);
}
