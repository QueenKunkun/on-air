import { h } from 'preact';
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { LS_KEYS } from '../../common/localStorageKeys';
import { ConnectionStatus } from './ConnectionStatus';
import { ThemeSelect } from './ThemeSelect';
import type { ConnectionStatus as ConnectionStatusType } from '../hooks/useWebSocket';

interface BannerProps {
	connStatus?: ConnectionStatusType;
	wsSend?: (msg: object) => void;
	fullPath?: string;
}

export function Banner({ connStatus, wsSend, fullPath }: BannerProps) {
	const [theme, setTheme] = useLocalStorage(LS_KEYS.THEME, 'auto');
	const [fs, setFs] = useLocalStorage(LS_KEYS.FONT_SIZE, '16');
	const [sbw, setSbw] = useLocalStorage(LS_KEYS.SCROLLBAR_WIDTH, '16');
	const [mw, setMw] = useLocalStorage(LS_KEYS.MAX_WIDTH, '920');
	const [wpOn, setWpOn] = useState(false);
	const [sbProp, setSbProp] = useState(() => {
		try { return localStorage.getItem(LS_KEYS.SCROLLBAR_PROPORTIONAL) === 'true'; } catch { return false; }
	});
	const [keepAlive, setKeepAlive] = useLocalStorage('onair-keep-alive', 'follow-vscode');
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [tooltip, setTooltip] = useState<{ content: preact.ComponentChildren; x: number; y: number } | null>(null);
	const rootRef = useRef<HTMLDivElement>(null);
	const contentRef = useRef<HTMLElement | null>(null);
	const modalRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		try { localStorage.setItem(LS_KEYS.SCROLLBAR_PROPORTIONAL, String(sbProp)); } catch { /* ignore */ }
	}, [sbProp]);

	useEffect(() => {
		contentRef.current = document.getElementById('content');
	}, []);

	// Theme sync
	useEffect(() => {
		const html = document.documentElement;
		if (theme === 'auto') html.removeAttribute('data-theme');
		else html.setAttribute('data-theme', theme);
	}, [theme]);

	// Font size sync
	useEffect(() => {
		if (contentRef.current) contentRef.current.style.fontSize = fs + 'px';
	}, [fs]);

	// Scrollbar width sync
	useEffect(() => {
		document.documentElement.style.setProperty('--sb-w', sbw + 'px');
	}, [sbw]);

	// Scrollbar proportional thumb sync
	useEffect(() => {
		if (sbProp) document.documentElement.style.setProperty('--sb-thumb-min', '0px');
		else document.documentElement.style.removeProperty('--sb-thumb-min');
	}, [sbProp]);

	// Max width sync
	useEffect(() => {
		if (contentRef.current) contentRef.current.style.maxWidth = mw !== '0' ? mw + 'px' : 'none';
	}, [mw]);

	// Word wrap sync
	useEffect(() => {
		contentRef.current?.classList.toggle('wp', wpOn);
	}, [wpOn]);

	// Keep-alive sync to server
	useEffect(() => {
		if (wsSend) wsSend({ type: 'keep-alive', value: keepAlive === 'keep-alive' });
	}, [keepAlive, wsSend]);

	// Portal-like: append rendered content to #banner
	useEffect(() => {
		const banner = document.getElementById('banner');
		const root = rootRef.current;
		if (!banner || !root) return;

		while (banner.firstChild) banner.removeChild(banner.firstChild);
		banner.appendChild(root);

		return () => {
			if (root.parentNode === banner) banner.removeChild(root);
		};
	}, []);

	// Track banner height and sync to --banner-h CSS variable
	useEffect(() => {
		const banner = document.getElementById('banner');
		if (!banner) return;

		function updateHeight() {
			document.documentElement.style.setProperty('--banner-h', banner!.offsetHeight + 'px');
		}
		updateHeight();

		const ro = new ResizeObserver(updateHeight);
		ro.observe(banner);
		return () => ro.disconnect();
	}, []);

	// Close modal on Escape or outside click
	useEffect(() => {
		if (!settingsOpen) return;
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setSettingsOpen(false);
		};
		const onClickOutside = (e: MouseEvent) => {
			if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
				setSettingsOpen(false);
			}
		};
		document.addEventListener('keydown', onKeyDown);
		document.addEventListener('mousedown', onClickOutside);
		return () => {
			document.removeEventListener('keydown', onKeyDown);
			document.removeEventListener('mousedown', onClickOutside);
		};
	}, [settingsOpen]);

	const [copied, setCopied] = useState(false);

	const handleVerClick = useCallback(() => {
		const ver = window.__ONAIR__?.version || 'dev';
		navigator.clipboard?.writeText(ver).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		}).catch(() => {});
	}, []);

	// Copy path split button
	const [copyMode, setCopyMode] = useLocalStorage<string>(LS_KEYS.COPY_MODE, 'full');
	const [copyMenuOpen, setCopyMenuOpen] = useState(false);
	const copyMenuRef = useRef<HTMLDivElement>(null);
	const displayPath = fullPath || window.__ONAIR__?.fullPath || '';
	const rootDir = window.__ONAIR__?.rootDir || '';
	const relPath = (rootDir && displayPath.startsWith(rootDir))
		? displayPath.slice(rootDir.length).replace(/^\//, '')
		: displayPath;

	useEffect(() => {
		if (!copyMenuOpen) return;
		const close = (e: MouseEvent) => {
			if (copyMenuRef.current && !copyMenuRef.current.contains(e.target as Node)) {
				setCopyMenuOpen(false);
			}
		};
		document.addEventListener('mousedown', close);
		return () => document.removeEventListener('mousedown', close);
	}, [copyMenuOpen]);

	const handleCopyPath = useCallback(() => {
		const text = copyMode === 'relative' ? relPath : displayPath;
		navigator.clipboard?.writeText(text).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		}).catch(() => {});
	}, [copyMode, relPath, displayPath]);

	const themes = window.__ONAIR__?.themes || [];

	// Split path into three parts: project root, relative dir, filename
	let rootName = '';
	let relDir = '';
	let fileName = displayPath;
	if (rootDir && displayPath.startsWith(rootDir)) {
		const rel = displayPath.slice(rootDir.length).replace(/^\//, '');
		const parts = rel.split('/');
		fileName = parts.pop() || rel;
		relDir = parts.join('/');
		rootName = rootDir.split('/').pop() || rootDir;
	} else {
		// Fallback: use second-to-last dir as root hint
		const parts = displayPath.split('/');
		fileName = parts.pop() || displayPath;
		const dirParts = parts.join('/').split('/');
		if (dirParts.length >= 2) {
			rootName = dirParts[dirParts.length - 1];
			relDir = dirParts.slice(0, -1).join('/');
		} else {
			relDir = parts.join('/');
		}
	}

	return (
		<div ref={rootRef} style={{ display: 'contents' }}>
			{connStatus && <ConnectionStatus icon={connStatus.icon} message={connStatus.message} offline={connStatus.offline} />}
			<div class="tb-center">
				<span class="tb-filepath" title={displayPath}>
					{rootName && <span class="tb-filepath-root">{rootName}</span>}
					{relDir && <span class="tb-filepath-sep">/</span>}
					{relDir && <span class="tb-filepath-dir">{relDir}</span>}
					<span class="tb-filepath-sep">/</span>
					<span class="tb-filepath-name">{fileName}</span>
				</span>
				<div class="tb-copy-wrap" ref={copyMenuRef}>
					<button class="tb-copy-btn" title={copyMode === 'relative' ? 'Copy relative path' : 'Copy full path'} onClick={handleCopyPath}>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
						</svg>
					</button>
					<button class="tb-copy-caret" onClick={() => setCopyMenuOpen(!copyMenuOpen)}>
						<svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M2 3.5L5 6.5L8 3.5Z" /></svg>
					</button>
					{copyMenuOpen && (
						<div class="tb-copy-menu">
							<button class={'tb-copy-menu-item' + (copyMode === 'full' ? ' tb-copy-menu-active' : '')} onClick={() => { setCopyMode('full'); setCopyMenuOpen(false); }}>
								Copy full path
							</button>
							<button class={'tb-copy-menu-item' + (copyMode === 'relative' ? ' tb-copy-menu-active' : '')} onClick={() => { setCopyMode('relative'); setCopyMenuOpen(false); }}>
								Copy relative path
							</button>
						</div>
					)}
				</div>
			</div>
			<button class="tb-settings-btn" title="Settings" onClick={() => setSettingsOpen(true)}>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
					<line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
					<line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
					<line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" />
					<line x1="17" y1="16" x2="23" y2="16" />
				</svg>
			</button>
			<div class="ver-badge" id="verBadge" title="Click to copy version"
				onClick={handleVerClick}>
				{copied ? 'Copied!' : `v${window.__ONAIR__?.version || 'dev'}`}
			</div>

			{settingsOpen && (
				<div class="settings-overlay">
					{tooltip && <div class="settings-tooltip" style={{ left: tooltip.x, top: tooltip.y, transform: 'translateX(-50%) translateY(-100%)' }}>{tooltip.content}</div>}
					<div class="settings-modal" ref={modalRef}>
						<div class="settings-modal-header">
							<span class="settings-modal-title">Settings</span>
							<button class="settings-modal-close" onClick={() => setSettingsOpen(false)}>×</button>
						</div>
						<div class="settings-modal-body">
							<div class="settings-section">
								<label class="settings-label">Theme</label>
								<ThemeSelect themes={themes} value={theme} onChange={setTheme} />
							</div>
							<div class="settings-section">
								<label class="settings-label">Server close when:
									<span class="settings-hint"
										onMouseEnter={(e) => {
											const r = (e.target as HTMLElement).getBoundingClientRect();
											setTooltip({ content: h('ul', { style: { margin: 0, padding: '0 0 0 16px', listStyle: 'disc' } },
											h('li', null, 'all tracked files closed — server shuts down when you close all previewed files'),
											h('li', null, 'vscode closed — server stays alive until VS Code quits'),
										), x: r.left + r.width / 2, y: r.top - 8 });
										}}
										onMouseLeave={() => setTooltip(null)}
									>?</span>
								</label>
								<select class="settings-select" value={keepAlive}
									onChange={(e) => setKeepAlive((e.target as HTMLSelectElement).value)}>
									<option value="follow-vscode">all tracked files closed</option>
									<option value="keep-alive">vscode closed</option>
								</select>
							</div>
							<div class="settings-section">
								<label class="settings-label">Word wrap</label>
								<label class="settings-toggle">
									<input type="checkbox" checked={wpOn} onChange={() => setWpOn(v => !v)} />
									<span class="settings-toggle-slider"></span>
								</label>
							</div>
							<div class="settings-section">
								<label class="settings-label">Proportional scrollbar</label>
								<label class="settings-toggle">
									<input type="checkbox" checked={sbProp} onChange={() => setSbProp(v => !v)} />
									<span class="settings-toggle-slider"></span>
								</label>
							</div>
							<div class="settings-section">
								<label class="settings-label">Font size</label>
								<div class="settings-stepper">
									<button onClick={() => setFs(String(Math.max(12, Math.min(28, parseInt(fs) - 2))))}>−</button>
									<input type="number" min="12" max="28" value={fs}
										onChange={(e) => {
											const v = parseInt((e.target as HTMLInputElement).value);
											if (!isNaN(v)) setFs(String(Math.max(12, Math.min(28, v))));
										}} />
									<button onClick={() => setFs(String(Math.max(12, Math.min(28, parseInt(fs) + 2))))}>+</button>
									<button class="settings-reset" onClick={() => setFs('16')}>↺</button>
								</div>
							</div>
							<div class="settings-section">
								<label class="settings-label">Scrollbar width</label>
								<div class="settings-stepper">
									<button onClick={() => setSbw(String(Math.max(0, parseInt(sbw) - 4)))}>−</button>
									<input type="number" min="0" step="4" value={sbw}
										onChange={(e) => {
											const v = parseInt((e.target as HTMLInputElement).value);
											if (!isNaN(v)) setSbw(String(Math.max(0, v)));
										}} />
									<button onClick={() => setSbw(String(Math.max(0, parseInt(sbw) + 4)))}>+</button>
									<button class="settings-reset" onClick={() => setSbw('16')}>↺</button>
								</div>
							</div>
							<div class="settings-section">
								<label class="settings-label">Max content width</label>
								<div class="settings-stepper">
									<button onClick={() => setMw(String(Math.max(0, parseInt(mw) - 20)))}>−</button>
									<input type="number" min="0" step="20" value={mw}
										onChange={(e) => {
											const v = parseInt((e.target as HTMLInputElement).value);
											if (!isNaN(v) && v >= 0) setMw(String(v));
										}} />
									<button onClick={() => setMw(String(Math.max(0, parseInt(mw) + 20)))}>+</button>
									<button class="settings-reset" onClick={() => setMw('920')}>↺</button>
								</div>
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
