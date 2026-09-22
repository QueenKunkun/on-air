import { h } from 'preact';
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { LS_KEYS } from '../../common/localStorageKeys';

interface CopyPathButtonProps {
	fullPath: string;
}

export function CopyPathButton({ fullPath }: CopyPathButtonProps) {
	const [copyMode, setCopyMode] = useLocalStorage<string>(LS_KEYS.COPY_MODE, 'full');
	const [menuOpen, setMenuOpen] = useState(false);
	const [copied, setCopied] = useState(false);
	const wrapRef = useRef<HTMLDivElement>(null);

	const rootDir = window.__ONAIR__?.rootDir || '';
	const relPath = (rootDir && fullPath.startsWith(rootDir))
		? fullPath.slice(rootDir.length).replace(/^\//, '')
		: fullPath;

	// Close menu on outside click (same pattern as settings modal)
	useEffect(() => {
		if (!menuOpen) return;
		const close = (e: MouseEvent) => {
			if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
				setMenuOpen(false);
			}
		};
		// Delay to avoid closing on the same click that opened the menu
		const timer = setTimeout(() => document.addEventListener('mousedown', close), 0);
		return () => { clearTimeout(timer); document.removeEventListener('mousedown', close); };
	}, [menuOpen]);

	const handleCopy = useCallback(() => {
		const text = copyMode === 'relative' ? relPath : fullPath;
		navigator.clipboard?.writeText(text).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		}).catch(() => {});
	}, [copyMode, relPath, fullPath]);

	return (
		<div class="tb-copy-wrap" ref={wrapRef}>
			<button class="tb-copy-btn" title={copied ? 'Copied!' : (copyMode === 'relative' ? 'Copy relative path' : 'Copy full path')} onClick={handleCopy}>
				{copied ? (
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<polyline points="20 6 9 17 4 12" />
					</svg>
				) : (
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
					</svg>
				)}
			</button>
			<button class="tb-copy-caret" onClick={() => setMenuOpen(!menuOpen)}>
				<svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" style="pointer-events:none"><path d="M2 3.5L5 6.5L8 3.5Z" /></svg>
			</button>
			{menuOpen && (
				<div class="tb-copy-menu">
					<button class={'tb-copy-menu-item' + (copyMode === 'full' ? ' tb-copy-menu-active' : '')} onMouseDown={(e) => { e.preventDefault(); setCopyMode('full'); setMenuOpen(false); }}>
						Copy full path
					</button>
					<button class={'tb-copy-menu-item' + (copyMode === 'relative' ? ' tb-copy-menu-active' : '')} onMouseDown={(e) => { e.preventDefault(); setCopyMode('relative'); setMenuOpen(false); }}>
						Copy relative path
					</button>
				</div>
			)}
		</div>
	);
}
