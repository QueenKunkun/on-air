import { h, Fragment } from 'preact';
import { useCallback, useEffect, useRef } from 'preact/hooks';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useResizer } from '../hooks/useResizer';

export function Layout({ children }: { children: preact.ComponentChildren }) {
	const [filesCollapsed, setFilesCollapsed] = useLocalStorage('onair-files-collapsed', '0');
	const [tocCollapsed, setTocCollapsed] = useLocalStorage('onair-toc-collapsed', '0');

	const filesSideRef = useRef(document.getElementById('filesSide'));
	const tocColRef = useRef(document.getElementById('tocCol'));
	const filesResizerRef = useRef(document.getElementById('filesResizer'));
	const tocResizerRef = useRef(document.getElementById('tocResizer'));
	const edgeHandlesRef = useRef(document.getElementById('edgeHandles'));
	const edgeFilesRef = useRef(document.querySelector('#edgeHandles [data-panel="files"]') as HTMLElement);
	const edgeTocRef = useRef(document.querySelector('#edgeHandles [data-panel="toc"]') as HTMLElement);
	const filesToggleRef = useRef(document.querySelector('#toggle-layer [data-panel="files"]') as HTMLElement);
	const tocToggleRef = useRef(document.querySelector('#toggle-layer [data-panel="toc"]') as HTMLElement);

	const fc = filesCollapsed === '1';
	const tc = tocCollapsed === '1';

	useResizer(filesResizerRef, filesSideRef, {
		axis: 'x', invert: false, key: 'onair-files-width', def: null, min: 120, max: Infinity,
		get: (el) => el.offsetWidth,
		set: (_, v) => { document.documentElement.style.setProperty('--files-w', v + 'px'); },
	}, []);

	useResizer(tocResizerRef, tocColRef, {
		axis: 'x', invert: false, key: 'onair-toc-width', def: null, min: 120, max: Infinity,
		get: (el) => el.offsetWidth,
		set: (_, v) => { document.documentElement.style.setProperty('--toc-w', v + 'px'); },
	}, []);

	const toggleFiles = useCallback(() => {
		const next = filesCollapsed !== '1';
		setFilesCollapsed(next ? '1' : '0');
		const el = filesSideRef.current;
		if (el) el.classList.toggle('collapsed', next);
		document.documentElement.style.setProperty('--files-w', next ? '0px' : (localStorage.getItem('onair-files-width') || '300') + 'px');
		document.documentElement.style.setProperty('--files-resizer-w', next ? '0px' : 'var(--resizer-w)');
		if (!next) window.dispatchEvent(new CustomEvent('onair:tree-activate'));
	}, [filesCollapsed, setFilesCollapsed]);

	const toggleToc = useCallback(() => {
		const next = tocCollapsed !== '1';
		setTocCollapsed(next ? '1' : '0');
		const el = tocColRef.current;
		if (el) el.classList.toggle('collapsed', next);
		document.documentElement.style.setProperty('--toc-w', next ? '0px' : (localStorage.getItem('onair-toc-width') || '200') + 'px');
		document.documentElement.style.setProperty('--toc-resizer-w', next ? '0px' : 'var(--resizer-w)');
	}, [tocCollapsed, setTocCollapsed]);

	const expandFiles = useCallback(() => {
		setFilesCollapsed('0');
		const el = filesSideRef.current;
		if (el) el.classList.remove('collapsed');
		document.documentElement.style.setProperty('--files-w', (localStorage.getItem('onair-files-width') || '300') + 'px');
		document.documentElement.style.setProperty('--files-resizer-w', 'var(--resizer-w)');
		window.dispatchEvent(new CustomEvent('onair:tree-activate'));
	}, [setFilesCollapsed]);

	const expandToc = useCallback(() => {
		setTocCollapsed('0');
		const el = tocColRef.current;
		if (el) el.classList.remove('collapsed');
		document.documentElement.style.setProperty('--toc-w', (localStorage.getItem('onair-toc-width') || '200') + 'px');
		document.documentElement.style.setProperty('--toc-resizer-w', 'var(--resizer-w)');
	}, [setTocCollapsed]);

	// Sync collapsed classes on mount and when state changes
	useEffect(() => {
		const el = filesSideRef.current;
		if (el) el.classList.toggle('collapsed', fc);
		const toggle = filesToggleRef.current;
		if (toggle) toggle.classList.toggle('hidden', fc);
	}, [fc]);

	useEffect(() => {
		const el = tocColRef.current;
		if (el) el.classList.toggle('collapsed', tc);
		const toggle = tocToggleRef.current;
		if (toggle) toggle.classList.toggle('hidden', tc);
	}, [tc]);

	// Edge handles visibility
	useEffect(() => {
		const anyCollapsed = fc || tc;
		const edgeHandles = edgeHandlesRef.current;
		if (edgeHandles) edgeHandles.classList.toggle('visible', anyCollapsed);
		if (edgeFilesRef.current) edgeFilesRef.current.style.display = fc ? '' : 'none';
		if (edgeTocRef.current) edgeTocRef.current.style.display = tc ? '' : 'none';
	}, [fc, tc]);

	// Bind toggle click handlers
	useEffect(() => {
		const filesToggle = filesToggleRef.current;
		const tocToggle = tocToggleRef.current;

		function onFilesToggle(e: Event) {
			e.stopPropagation();
			if (filesResizerRef.current?.getAttribute('data-dragging')) return;
			toggleFiles();
		}
		function onTocToggle(e: Event) {
			e.stopPropagation();
			if (tocResizerRef.current?.getAttribute('data-dragging')) return;
			toggleToc();
		}

		filesToggle?.addEventListener('click', onFilesToggle);
		tocToggle?.addEventListener('click', onTocToggle);
		return () => {
			filesToggle?.removeEventListener('click', onFilesToggle);
			tocToggle?.removeEventListener('click', onTocToggle);
		};
	}, [toggleFiles, toggleToc]);

	// Bind edge handle click handlers
	useEffect(() => {
		const edgeFiles = edgeFilesRef.current;
		const edgeToc = edgeTocRef.current;
		edgeFiles?.addEventListener('click', expandFiles);
		edgeToc?.addEventListener('click', expandToc);
		return () => {
			edgeFiles?.removeEventListener('click', expandFiles);
			edgeToc?.removeEventListener('click', expandToc);
		};
	}, [expandFiles, expandToc]);

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
