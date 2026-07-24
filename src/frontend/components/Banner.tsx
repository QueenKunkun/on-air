import { h } from 'preact';
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { ConnectionStatus } from './ConnectionStatus';
import type { ConnectionStatus as ConnectionStatusType } from '../hooks/useWebSocket';

interface BannerProps {
	connStatus?: ConnectionStatusType;
}

export function Banner({ connStatus }: BannerProps) {
	const [theme, setTheme] = useLocalStorage('onair-theme', 'auto');
	const [fs, setFs] = useLocalStorage('onair-font-size', '16');
	const [sbw, setSbw] = useLocalStorage('onair-scrollbar-width', '16');
	const [mw, setMw] = useLocalStorage('onair-max-width', '920');
	const [wpOn, setWpOn] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	const contentRef = useRef<HTMLElement | null>(null);

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

	const handleVerClick = useCallback(() => {
		const ver = window.__ONAIR__?.version || 'dev';
		navigator.clipboard?.writeText(ver).catch(() => {});
	}, []);

	const themes = window.__ONAIR__?.themes || [];

	return (
		<div ref={rootRef} style={{ display: 'contents' }}>
			{connStatus && <ConnectionStatus icon={connStatus.icon} message={connStatus.message} offline={connStatus.offline} />}
			<div class="tb-center">
				<select class="bp-select" id="themeSelect" title="Theme"
					value={theme}
					onChange={(e) => setTheme((e.target as HTMLSelectElement).value)}>
					{themes.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
				</select>
				<button class="wp-btn" id="wpBtn" title="Toggle word wrapping for code blocks"
					onClick={() => setWpOn(!wpOn)}>
					{wpOn ? 'Unwrap code' : 'Wrap code'}
				</button>
				<button class="wp-btn" id="hoverBtn" title="Toggle hover preview for footnote/annotation notes">
					Hover notes
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
				v{window.__ONAIR__?.version || 'dev'}
			</div>
		</div>
	);
}
