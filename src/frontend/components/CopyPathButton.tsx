import { h } from 'preact';
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { LS_KEYS } from '../../common/localStorageKeys';

interface CopyPathButtonProps {
	fullPath: string;
}

export function CopyPathButton({ fullPath }: CopyPathButtonProps) {
	const [copyMode, setCopyMode] = useLocalStorage<string>(LS_KEYS.COPY_MODE, 'full');
	const [copied, setCopied] = useState(false);
	const [menuOpen, setMenuOpen] = useState(false);
	const wrapRef = useRef<HTMLDivElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);

	const rootDir = window.__ONAIR__?.rootDir || '';
	const relPath = (rootDir && fullPath.startsWith(rootDir))
		? fullPath.slice(rootDir.length).replace(/^\//, '')
		: fullPath;

	// Position fixed menu relative to caret button (same as ThemeSelect)
	useEffect(() => {
		if (!menuOpen || !menuRef.current || !wrapRef.current) return;
		const caret = wrapRef.current.querySelector('.tb-copy-caret');
		if (!caret) return;
		const rect = caret.getBoundingClientRect();
		menuRef.current.style.left = rect.left + 'px';
		menuRef.current.style.top = (rect.bottom + 4) + 'px';
	}, [menuOpen]);

	// Close on outside click or Escape (same as ThemeSelect)
	useEffect(() => {
		if (!menuOpen) return;
		const onDown = (e: MouseEvent) => {
			if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setMenuOpen(false);
		};
		document.addEventListener('mousedown', onDown);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('mousedown', onDown);
			document.removeEventListener('keydown', onKey);
		};
	}, [menuOpen]);

	const doCopy = useCallback((mode: string) => {
		const text = mode === 'relative' ? relPath : fullPath;
		navigator.clipboard?.writeText(text).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		}).catch(() => {});
	}, [relPath, fullPath]);

	const handleCopy = useCallback(() => doCopy(copyMode), [copyMode, doCopy]);

	const handleMenuSelect = useCallback((mode: string) => {
		setCopyMode(mode);
		setMenuOpen(false);
		doCopy(mode);
	}, [setCopyMode, doCopy]);

	return (
		<div class={'tb-copy-wrap' + (copied ? ' tb-copy-flash' : '')} ref={wrapRef}>
			<button class="tb-copy-btn" title={copied ? 'Copied!' : (copyMode === 'relative' ? 'Copy relative path' : 'Copy full path')} onClick={handleCopy}>
				{copied ? (
					<svg class="tb-copy-icon tb-copy-icon--check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
						<polyline points="20 6 9 17 4 12" />
					</svg>
				) : copyMode === 'relative' ? (
					<svg class="tb-copy-icon tb-copy-icon--rel" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
						<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
						<circle cx="5" cy="5" r="3" fill="var(--link-c)" stroke="none" />
						<text x="5" y="6.5" font-size="4" font-weight="700" fill="#fff" stroke="none" text-anchor="middle" font-family="monospace">~</text>
					</svg>
				) : (
					<svg class="tb-copy-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
						<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
					</svg>
				)}
			</button>
			<button class="tb-copy-caret" title="Copy options" onClick={() => setMenuOpen(o => !o)}>
				<svg width="8" height="8" viewBox="0 0 10 10" fill="currentColor" style="pointer-events:none"><path d="M2 3.5L5 6.5L8 3.5Z" /></svg>
			</button>
			{menuOpen && (
				<div ref={menuRef} class="tb-copy-menu">
					<button class={'tb-copy-menu-item' + (copyMode === 'full' ? ' tb-copy-menu-active' : '')} onClick={() => handleMenuSelect('full')}>
						Copy full path
					</button>
					<button class={'tb-copy-menu-item' + (copyMode === 'relative' ? ' tb-copy-menu-active' : '')} onClick={() => handleMenuSelect('relative')}>
						Copy relative path
					</button>
				</div>
			)}
		</div>
	);
}
