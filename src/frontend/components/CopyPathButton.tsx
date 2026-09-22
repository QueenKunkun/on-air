import { h } from 'preact';
import { useState, useCallback, useRef, useEffect } from 'preact/hooks';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { LS_KEYS } from '../../common/localStorageKeys';

interface CopyPathButtonProps {
	fullPath: string;
}

export function CopyPathButton({ fullPath }: CopyPathButtonProps) {
	const [copyMode, setCopyMode] = useLocalStorage<string>(LS_KEYS.COPY_MODE, 'full');
	const [copied, setCopied] = useState(false);
	const detailsRef = useRef<HTMLDetailsElement>(null);

	const rootDir = window.__ONAIR__?.rootDir || '';
	const relPath = (rootDir && fullPath.startsWith(rootDir))
		? fullPath.slice(rootDir.length).replace(/^\//, '')
		: fullPath;

	// Close on outside click
	useEffect(() => {
		const close = (e: MouseEvent) => {
			if (detailsRef.current && !detailsRef.current.contains(e.target as Node)) {
				detailsRef.current.open = false;
			}
		};
		document.addEventListener('mousedown', close);
		return () => document.removeEventListener('mousedown', close);
	}, []);

	const handleCopy = useCallback(() => {
		const text = copyMode === 'relative' ? relPath : fullPath;
		navigator.clipboard?.writeText(text).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		}).catch(() => {});
	}, [copyMode, relPath, fullPath]);

	const handleSelect = (mode: string) => {
		setCopyMode(mode);
		if (detailsRef.current) detailsRef.current.open = false;
	};

	return (
		<details class="tb-copy-wrap" ref={detailsRef}>
			<summary class="tb-copy-summary" onClick={(e) => {
				// Left click on summary = copy; only open menu on the caret area
				const rect = (e.target as HTMLElement).getBoundingClientRect();
				const clickX = (e as MouseEvent).clientX;
				if (clickX < rect.right - 18) {
					// Click on the main button area (left 18px from right edge = caret zone)
					e.preventDefault();
					handleCopy();
				}
				// Otherwise let default behavior open the <details>
			}}>
				{copied ? (
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<polyline points="20 6 9 17 4 12" />
					</svg>
				) : (
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
					</svg>
				)}
			</summary>
			<div class="tb-copy-menu">
				<button class={'tb-copy-menu-item' + (copyMode === 'full' ? ' tb-copy-menu-active' : '')} onMouseDown={(e) => { e.preventDefault(); handleSelect('full'); }}>
					Copy full path
				</button>
				<button class={'tb-copy-menu-item' + (copyMode === 'relative' ? ' tb-copy-menu-active' : '')} onMouseDown={(e) => { e.preventDefault(); handleSelect('relative'); }}>
					Copy relative path
				</button>
			</div>
		</details>
	);
}
