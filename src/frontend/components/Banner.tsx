import { h } from 'preact';
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { LS_KEYS } from '../../common/localStorageKeys';
import { ConnectionStatus } from './ConnectionStatus';
import { ThemeSelect } from './ThemeSelect';
import type { ConnectionStatus as ConnectionStatusType } from '../hooks/useWebSocket';

interface BannerProps {
	connStatus?: ConnectionStatusType;
}

export function Banner({ connStatus }: BannerProps) {
	const [theme, setTheme] = useLocalStorage(LS_KEYS.THEME, 'auto');
	const [fs, setFs] = useLocalStorage(LS_KEYS.FONT_SIZE, '16');
	const [sbw, setSbw] = useLocalStorage(LS_KEYS.SCROLLBAR_WIDTH, '16');
	const [mw, setMw] = useLocalStorage(LS_KEYS.MAX_WIDTH, '920');
	const [wpOn, setWpOn] = useState(false);
	const [sbProp, setSbProp] = useState(() => {
		try { return localStorage.getItem(LS_KEYS.SCROLLBAR_PROPORTIONAL) === 'true'; } catch { return false; }
	});
	const rootRef = useRef<HTMLDivElement>(null);
	const contentRef = useRef<HTMLElement | null>(null);

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

	const [copied, setCopied] = useState(false);

	const handleVerClick = useCallback(() => {
		const ver = window.__ONAIR__?.version || 'dev';
		navigator.clipboard?.writeText(ver).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		}).catch(() => {});
	}, []);

	const themes = window.__ONAIR__?.themes || [];

	return (
		<div ref={rootRef} style={{ display: 'contents' }}>
			{connStatus && <ConnectionStatus icon={connStatus.icon} message={connStatus.message} offline={connStatus.offline} />}
			<div class="tb-center">
				<ThemeSelect themes={themes} value={theme} onChange={setTheme} />
			<button class={`wp-btn${wpOn ? ' on' : ''}`} id="wpBtn" title="Toggle word wrapping for code blocks"
				onClick={() => setWpOn(!wpOn)}>
				↵
			</button>
			<button class="wp-btn" id="hoverBtn" title="Toggle hover preview for footnote/annotation notes">
				💬
			</button>
			<button class={`wp-btn${sbProp ? ' on' : ''}`} id="sbPropBtn" title="Toggle proportional scrollbar thumb"
				onClick={() => setSbProp(v => !v)}>
				∷
			</button>
				<span class="bp-group"><span class="bp-label" title="Font size">A</span>
					<button class="bp-btn" id="fsDec" title="Decrease font size"
						onClick={() => setFs(String(Math.max(12, Math.min(28, parseInt(fs) - 2))))}>−</button>
					<input class="fs-input" id="fsInput" type="number" min="12" max="28" value={fs} title="Font size (12-28)"
						onChange={(e) => {
							const v = parseInt((e.target as HTMLInputElement).value);
							if (!isNaN(v)) setFs(String(Math.max(12, Math.min(28, v))));
						}} />
					<button class="bp-btn" id="fsReset" title="Reset font size to default"
						onClick={() => setFs('16')}>↺</button>
					<button class="bp-btn" id="fsInc" title="Increase font size"
						onClick={() => setFs(String(Math.max(12, Math.min(28, parseInt(fs) + 2))))}>+</button></span>
				<span class="bp-group"><span class="bp-label" title="Scrollbar width">‖</span>
					<button class="bp-btn" id="sbDec" title="Thinner scrollbars"
						onClick={() => setSbw(String(Math.max(0, parseInt(sbw) - 4)))}>−</button>
					<input class="fs-input" id="sbInput" type="number" min="0" step="4" value={sbw} title="Scrollbar width"
						onChange={(e) => {
							const v = parseInt((e.target as HTMLInputElement).value);
							if (!isNaN(v)) setSbw(String(Math.max(0, v)));
						}} />
					<button class="bp-btn" id="sbReset" title="Reset scrollbar width to default"
						onClick={() => setSbw('16')}>↺</button>
					<button class="bp-btn" id="sbInc" title="Thicker scrollbars"
						onClick={() => setSbw(String(Math.max(0, parseInt(sbw) + 4)))}>+</button></span>
				<span class="bp-group"><span class="bp-label" title="Max content width (0 = no limit)">W</span>
					<button class="bp-btn" id="mwDec" title="Narrower content"
						onClick={() => setMw(String(Math.max(0, parseInt(mw) - 20)))}>−</button>
					<input class="fs-input" id="mwInput" type="number" min="0" step="20" value={mw} title="Max content width in px (0 = no limit)"
						onChange={(e) => {
							const v = parseInt((e.target as HTMLInputElement).value);
							if (!isNaN(v) && v >= 0) setMw(String(v));
						}} />
					<button class="bp-btn" id="mwReset" title="Reset max width to default"
						onClick={() => setMw('920')}>↺</button>
					<button class="bp-btn" id="mwInc" title="Wider content"
						onClick={() => setMw(String(Math.max(0, parseInt(mw) + 20)))}>+</button></span>
			</div>
			<div class="ver-badge" id="verBadge" title="Click to copy version"
				onClick={handleVerClick}>
				{copied ? 'Copied!' : `v${window.__ONAIR__?.version || 'dev'}`}
			</div>
		</div>
	);
}
