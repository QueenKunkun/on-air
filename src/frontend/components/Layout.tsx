import { h, Fragment } from 'preact';
import { useCallback, useEffect, useRef } from 'preact/hooks';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useResizer } from '../hooks/useResizer';
import { LS_KEYS } from '../../common/localStorageKeys';

export function Layout({ children }: { children: preact.ComponentChildren }) {
	const [filesCollapsed, setFilesCollapsed] = useLocalStorage(LS_KEYS.FILES_COLLAPSED, '0');
	const [tocCollapsed, setTocCollapsed] = useLocalStorage(LS_KEYS.TOC_COLLAPSED, '0');

	const filesSideRef = useRef(document.getElementById('filesSide'));
	const tocColRef = useRef(document.getElementById('tocCol'));
	const filesResizerRef = useRef(document.getElementById('filesResizer'));
	const tocResizerRef = useRef(document.getElementById('tocResizer'));
	const edgeHandlesRef = useRef(document.getElementById('edgeHandles'));
	const edgeFilesRef = useRef(document.querySelector('#edgeHandles [data-panel="files"]') as HTMLElement);
	const edgeTocRef = useRef(document.querySelector('#edgeHandles [data-panel="toc"]') as HTMLElement);

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
	}, [filesCollapsed, setFilesCollapsed]);

	const toggleToc = useCallback(() => {
		const next = tocCollapsed !== '1';
		setTocCollapsed(next ? '1' : '0');
		const el = tocColRef.current;
		if (el) el.classList.toggle('collapsed', next);
		document.documentElement.style.setProperty('--toc-w', next ? '0px' : (localStorage.getItem(LS_KEYS.TOC_WIDTH) || '200') + 'px');
		document.documentElement.style.setProperty('--toc-resizer-w', next ? '0px' : 'var(--resizer-w)');
	}, [tocCollapsed, setTocCollapsed]);

	const expandFiles = useCallback(() => {
		setFilesCollapsed('0');
		const el = filesSideRef.current;
		if (el) el.classList.remove('collapsed');
		document.documentElement.style.setProperty('--files-w', (localStorage.getItem(LS_KEYS.FILES_WIDTH) || '300') + 'px');
		document.documentElement.style.setProperty('--files-resizer-w', 'var(--resizer-w)');
		window.dispatchEvent(new CustomEvent('onair:tree-activate'));
	}, [setFilesCollapsed]);

	const expandToc = useCallback(() => {
		setTocCollapsed('0');
		const el = tocColRef.current;
		if (el) el.classList.remove('collapsed');
		document.documentElement.style.setProperty('--toc-w', (localStorage.getItem(LS_KEYS.TOC_WIDTH) || '200') + 'px');
		document.documentElement.style.setProperty('--toc-resizer-w', 'var(--resizer-w)');
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

	// Edge handles visibility
	useEffect(() => {
		const anyCollapsed = fc || tc;
		const edgeHandles = edgeHandlesRef.current;
		if (edgeHandles) edgeHandles.classList.toggle('visible', anyCollapsed);
		if (edgeFilesRef.current) edgeFilesRef.current.style.display = fc ? '' : 'none';
		if (edgeTocRef.current) edgeTocRef.current.style.display = tc ? '' : 'none';
	}, [fc, tc]);

	// Bind collapse buttons (x in panel header) and edge handle click handlers
	useEffect(() => {
		function onCollapseFiles() {
			if (filesResizerRef.current?.getAttribute('data-dragging')) return;
			toggleFiles();
		}
		function onCollapseToc() {
			if (tocResizerRef.current?.getAttribute('data-dragging')) return;
			toggleToc();
		}

		window.addEventListener('onair:collapse-files', onCollapseFiles);
		window.addEventListener('onair:collapse-toc', onCollapseToc);

		const edgeFiles = edgeFilesRef.current;
		const edgeToc = edgeTocRef.current;
		edgeFiles?.addEventListener('click', expandFiles);
		edgeToc?.addEventListener('click', expandToc);
		return () => {
			window.removeEventListener('onair:collapse-files', onCollapseFiles);
			window.removeEventListener('onair:collapse-toc', onCollapseToc);
			edgeFiles?.removeEventListener('click', expandFiles);
			edgeToc?.removeEventListener('click', expandToc);
		};
	}, [toggleFiles, toggleToc, expandFiles, expandToc]);

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
