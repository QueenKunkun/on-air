import { h } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useLocalStorage } from '../hooks/useLocalStorage';

declare const __ONAIR_VERSION__: string;

function withScrollAnchor(fn: () => void) {
	const se = document.scrollingElement || document.documentElement;
	const contentEl = document.getElementById('content');
	if (!contentEl) { fn(); return; }
	const kids = contentEl.children;
	let anchor: Element | null = null;
	for (let i = 0; i < kids.length; i++) {
		if (kids[i].getBoundingClientRect().bottom > 0) { anchor = kids[i]; break; }
	}
	const before = anchor ? anchor.getBoundingClientRect().top : 0;
	fn();
	if (anchor) se.scrollTop += anchor.getBoundingClientRect().top - before;
}

export function Banner() {
	const themes = window.__ONAIR__?.themes;
	const version = window.__ONAIR__?.version || 'dev';

	const [theme, setTheme] = useLocalStorage('onair-theme', 'auto');
	const [fs, setFsRaw] = useLocalStorage('onair-font-size', '16');
	const [sbw, setSbwRaw] = useLocalStorage('onair-scrollbar-width', '16');
	const [mw, setMwRaw] = useLocalStorage('onair-max-width', '920');
	const [wrap, setWrap] = useState(false);

	const fsInputRef = useRef<HTMLInputElement>(null);
	const sbInputRef = useRef<HTMLInputElement>(null);
	const mwInputRef = useRef<HTMLInputElement>(null);

	const setFs = useCallback((v: number) => {
		const clamped = Math.max(12, Math.min(28, Math.round(v)));
		withScrollAnchor(() => {
			const el = document.getElementById('content');
			if (el) el.style.fontSize = clamped + 'px';
		});
		setFsRaw(String(clamped));
	}, [setFsRaw]);

	const setSbw = useCallback((v: number) => {
		const clamped = Math.max(0, Math.round(v));
		document.documentElement.style.setProperty('--sb-w', clamped + 'px');
		setSbwRaw(String(clamped));
	}, [setSbwRaw]);

	const setMw = useCallback((v: number) => {
		const clamped = Math.max(0, Math.round(v));
		const el = document.getElementById('content');
		if (el) el.style.maxWidth = clamped ? clamped + 'px' : 'none';
		setMwRaw(String(clamped));
	}, [setMwRaw]);

	// Apply saved values on mount
	useEffect(() => {
		const el = document.getElementById('content');
		if (el) el.style.fontSize = fs + 'px';
		document.documentElement.style.setProperty('--sb-w', sbw + 'px');
		if (el) el.style.maxWidth = mw !== '0' ? mw + 'px' : 'none';
	}, []);

	const applyTheme = useCallback((val: string) => {
		const html = document.documentElement;
		if (val === 'auto') html.removeAttribute('data-theme');
		else html.setAttribute('data-theme', val);
	}, []);

	useEffect(() => {
		applyTheme(theme);
	}, []);

	const onThemeChange = useCallback((e: Event) => {
		const val = (e.target as HTMLSelectElement).value;
		setTheme(val);
		applyTheme(val);
	}, [setTheme, applyTheme]);

	const toggleWrap = useCallback(() => {
		setWrap(prev => {
			const next = !prev;
			const el = document.getElementById('content');
			if (el) el.classList.toggle('wp', next);
			return next;
		});
	}, []);

	const copyVersion = useCallback(() => {
		const vb = document.getElementById('verBadge');
		if (!vb) return;
		const resetTimer: ReturnType<typeof setTimeout> | null = null;
		function flash() {
			vb.textContent = 'Copied!';
			clearTimeout(resetTimer!);
			setTimeout(() => { vb.textContent = version; }, 1200);
		}
		try {
			if (navigator.clipboard?.writeText) {
				navigator.clipboard.writeText(version).then(flash, flash);
			} else { flash(); }
		} catch { flash(); }
	}, [version]);

	return h('div', { class: 'md-online-banner', id: 'banner' },
		h('span', { id: 'bannerTxt', title: 'Connected, live preview active\u2026' },
			h('span', { id: 'bannerIcon' }, '\uD83D\uDD0C'),
			h('span', { id: 'bannerMsg', class: 'banner-msg' }, 'Connected, live preview active\u2026'),
		),
		h('div', { class: 'tb-center' },
			h('select', { class: 'bp-select', id: 'themeSelect', title: 'Theme', onChange: onThemeChange, value: theme },
				themes ? themes.map(t => h('option', { key: t.id, value: t.id }, t.label)) : null,
			),
			h('button', { class: 'wp-btn' + (wrap ? ' on' : ''), id: 'wpBtn', title: 'Toggle word wrapping for code blocks', onClick: toggleWrap },
				wrap ? 'Unwrap code' : 'Wrap code',
			),
			h('span', { class: 'bp-group' },
				h('span', { class: 'bp-label', title: 'Font size' }, 'A'),
				h('button', { class: 'bp-btn', id: 'fsDec', title: 'Decrease font size', onClick: () => setFs(parseInt(fs) - 2) }, '\u2212'),
				h('input', { class: 'fs-input', id: 'fsInput', type: 'number', min: '12', max: '28', value: fs, title: 'Font size (12-28)', ref: fsInputRef, onChange: (e: Event) => { const v = parseInt((e.target as HTMLInputElement).value); if (!isNaN(v)) setFs(v); } }),
				h('button', { class: 'bp-btn', id: 'fsReset', title: 'Reset font size to default', onClick: () => setFs(16) }, '\u21BA'),
				h('button', { class: 'bp-btn', id: 'fsInc', title: 'Increase font size', onClick: () => setFs(parseInt(fs) + 2) }, '+'),
			),
			h('span', { class: 'bp-group' },
				h('span', { class: 'bp-label', title: 'Scrollbar width' }, '\u2016'),
				h('button', { class: 'bp-btn', id: 'sbDec', title: 'Thinner scrollbars', onClick: () => setSbw(parseInt(sbw) - 4) }, '\u2212'),
				h('input', { class: 'fs-input', id: 'sbInput', type: 'number', min: '0', step: '4', value: sbw, title: 'Scrollbar width', ref: sbInputRef, onChange: (e: Event) => { const v = parseInt((e.target as HTMLInputElement).value); if (!isNaN(v)) setSbw(v); } }),
				h('button', { class: 'bp-btn', id: 'sbReset', title: 'Reset scrollbar width to default', onClick: () => setSbw(16) }, '\u21BA'),
				h('button', { class: 'bp-btn', id: 'sbInc', title: 'Thicker scrollbars', onClick: () => setSbw(parseInt(sbw) + 4) }, '+'),
			),
			h('span', { class: 'bp-group' },
				h('span', { class: 'bp-label', title: 'Max content width (0 = no limit)' }, 'W'),
				h('button', { class: 'bp-btn', id: 'mwDec', title: 'Narrower content', onClick: () => setMw(parseInt(mw) - 20) }, '\u2212'),
				h('input', { class: 'fs-input', id: 'mwInput', type: 'number', min: '0', step: '20', value: mw, title: 'Max content width in px (0 = no limit)', ref: mwInputRef, onChange: (e: Event) => { const v = parseInt((e.target as HTMLInputElement).value); if (!isNaN(v) && v >= 0) setMw(v); } }),
				h('button', { class: 'bp-btn', id: 'mwReset', title: 'Reset max width to default', onClick: () => setMw(920) }, '\u21BA'),
				h('button', { class: 'bp-btn', id: 'mwInc', title: 'Wider content', onClick: () => setMw(parseInt(mw) + 20) }, '+'),
			),
		),
		h('div', {
			class: 'ver-badge',
			id: 'verBadge',
			'data-version': 'v' + version,
			title: 'Click to copy version',
			onClick: copyVersion,
		}, 'v' + version),
	);
}
