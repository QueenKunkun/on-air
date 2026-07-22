import { h } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { useLocalStorage } from '../hooks/useLocalStorage';

export function Banner() {
	const [theme, setTheme] = useLocalStorage('onair-theme', 'auto');
	const [fs, setFs] = useLocalStorage('onair-font-size', '16');
	const [sbw, setSbw] = useLocalStorage('onair-scrollbar-width', '16');
	const [mw, setMw] = useLocalStorage('onair-max-width', '920');

	// Refs to always have latest state in event handlers
	const themeRef = useRef(theme);
	const fsRef = useRef(fs);
	const sbwRef = useRef(sbw);
	const mwRef = useRef(mw);
	useEffect(() => { themeRef.current = theme; }, [theme]);
	useEffect(() => { fsRef.current = fs; }, [fs]);
	useEffect(() => { sbwRef.current = sbw; }, [sbw]);
	useEffect(() => { mwRef.current = mw; }, [mw]);

	// Setters as refs too, since they're stable but we want clean handler code
	const setFsRef = useRef(setFs);
	const setSbwRef = useRef(setSbw);
	const setMwRef = useRef(setMw);
	const setThemeRef = useRef(setTheme);

	useEffect(() => {
		const html = document.documentElement;
		const contentEl = document.getElementById('content');
		const themeSelect = document.getElementById('themeSelect') as HTMLSelectElement;
		const wpBtn = document.getElementById('wpBtn');
		const hoverBtn = document.getElementById('hoverBtn');
		const fsDec = document.getElementById('fsDec');
		const fsInc = document.getElementById('fsInc');
		const fsReset = document.getElementById('fsReset');
		const fsInput = document.getElementById('fsInput') as HTMLInputElement;
		const sbDec = document.getElementById('sbDec');
		const sbInc = document.getElementById('sbInc');
		const sbReset = document.getElementById('sbReset');
		const sbInput = document.getElementById('sbInput') as HTMLInputElement;
		const mwDec = document.getElementById('mwDec');
		const mwInc = document.getElementById('mwInc');
		const mwReset = document.getElementById('mwReset');
		const mwInput = document.getElementById('mwInput') as HTMLInputElement;
		const verBadge = document.getElementById('verBadge');

		if (!themeSelect) return;

		// Populate themes
		const themes = window.__ONAIR__?.themes;
		if (themes) {
			themeSelect.innerHTML = '';
			for (const t of themes) {
				const opt = document.createElement('option');
				opt.value = t.id;
				opt.textContent = t.label;
				themeSelect.appendChild(opt);
			}
		}

		// Apply saved theme
		function applyTheme(val: string) {
			if (val === 'auto') html.removeAttribute('data-theme');
			else html.setAttribute('data-theme', val);
		}
		themeSelect.value = themeRef.current;
		applyTheme(themeRef.current);

		// Apply saved values
		if (contentEl) contentEl.style.fontSize = fsRef.current + 'px';
		document.documentElement.style.setProperty('--sb-w', sbwRef.current + 'px');
		if (contentEl) contentEl.style.maxWidth = mwRef.current !== '0' ? mwRef.current + 'px' : 'none';
		if (fsInput) fsInput.value = fsRef.current;
		if (sbInput) sbInput.value = sbwRef.current;
		if (mwInput) mwInput.value = mwRef.current;

		// Event handlers — read from refs so they always have latest values
		function onThemeChange() {
			const val = themeSelect.value;
			setThemeRef.current(val);
			applyTheme(val);
		}
		function onWpClick() {
			wpBtn!.classList.toggle('on');
			wpBtn!.textContent = wpBtn!.classList.contains('on') ? 'Unwrap code' : 'Wrap code';
			contentEl?.classList.toggle('wp');
		}
		function onFsDec() { setFsRef.current(String(Math.max(12, Math.min(28, parseInt(fsRef.current) - 2)))); }
		function onFsInc() { setFsRef.current(String(Math.max(12, Math.min(28, parseInt(fsRef.current) + 2)))); }
		function onFsReset() { setFsRef.current('16'); }
		function onFsChange() {
			const v = parseInt(fsInput.value);
			if (!isNaN(v)) setFsRef.current(String(Math.max(12, Math.min(28, v))));
			else fsInput.value = fsRef.current;
		}
		function onSbDec() { setSbwRef.current(String(Math.max(0, parseInt(sbwRef.current) - 4))); }
		function onSbInc() { setSbwRef.current(String(Math.max(0, parseInt(sbwRef.current) + 4))); }
		function onSbReset() { setSbwRef.current('16'); }
		function onSbChange() {
			const v = parseInt(sbInput.value);
			if (!isNaN(v)) setSbwRef.current(String(Math.max(0, v)));
			else sbInput.value = sbwRef.current;
		}
		function onMwDec() { setMwRef.current(String(Math.max(0, parseInt(mwRef.current) - 20))); }
		function onMwInc() { setMwRef.current(String(Math.max(0, parseInt(mwRef.current) + 20))); }
		function onMwReset() { setMwRef.current('920'); }
		function onMwChange() {
			const v = parseInt(mwInput.value);
			if (!isNaN(v) && v >= 0) setMwRef.current(String(v));
			else mwInput.value = mwRef.current;
		}
		function onVerClick() {
			const version = window.__ONAIR__?.version || 'dev';
			verBadge!.textContent = 'Copied!';
			try {
				if (navigator.clipboard?.writeText) navigator.clipboard.writeText(version);
			} catch { /* ignore */ }
			setTimeout(() => { verBadge!.textContent = 'v' + version; }, 1200);
		}

		themeSelect.addEventListener('change', onThemeChange);
		wpBtn?.addEventListener('click', onWpClick);
		fsDec?.addEventListener('click', onFsDec);
		fsInc?.addEventListener('click', onFsInc);
		fsReset?.addEventListener('click', onFsReset);
		fsInput?.addEventListener('change', onFsChange);
		sbDec?.addEventListener('click', onSbDec);
		sbInc?.addEventListener('click', onSbInc);
		sbReset?.addEventListener('click', onSbReset);
		sbInput?.addEventListener('change', onSbChange);
		mwDec?.addEventListener('click', onMwDec);
		mwInc?.addEventListener('click', onMwInc);
		mwReset?.addEventListener('click', onMwReset);
		mwInput?.addEventListener('change', onMwChange);
		verBadge?.addEventListener('click', onVerClick);

		return () => {
			themeSelect.removeEventListener('change', onThemeChange);
			wpBtn?.removeEventListener('click', onWpClick);
			fsDec?.removeEventListener('click', onFsDec);
			fsInc?.removeEventListener('click', onFsInc);
			fsReset?.removeEventListener('click', onFsReset);
			fsInput?.removeEventListener('change', onFsChange);
			sbDec?.removeEventListener('click', onSbDec);
			sbInc?.removeEventListener('click', onSbInc);
			sbReset?.removeEventListener('click', onSbReset);
			sbInput?.removeEventListener('change', onSbChange);
			mwDec?.removeEventListener('click', onMwDec);
			mwInc?.removeEventListener('click', onMwInc);
			mwReset?.removeEventListener('click', onMwReset);
			mwInput?.removeEventListener('change', onMwChange);
			verBadge?.removeEventListener('click', onVerClick);
		};
	}, []); // Run once on mount

	// Sync state changes to DOM
	useEffect(() => {
		const contentEl = document.getElementById('content');
		if (contentEl) contentEl.style.fontSize = fs + 'px';
		const fsInput = document.getElementById('fsInput') as HTMLInputElement;
		if (fsInput) fsInput.value = fs;
	}, [fs]);

	useEffect(() => {
		document.documentElement.style.setProperty('--sb-w', sbw + 'px');
		const sbInput = document.getElementById('sbInput') as HTMLInputElement;
		if (sbInput) sbInput.value = sbw;
	}, [sbw]);

	useEffect(() => {
		const contentEl = document.getElementById('content');
		if (contentEl) contentEl.style.maxWidth = mw !== '0' ? mw + 'px' : 'none';
		const mwInput = document.getElementById('mwInput') as HTMLInputElement;
		if (mwInput) mwInput.value = mw;
	}, [mw]);

	useEffect(() => {
		const html = document.documentElement;
		const themeSelect = document.getElementById('themeSelect') as HTMLSelectElement;
		if (theme === 'auto') html.removeAttribute('data-theme');
		else html.setAttribute('data-theme', theme);
		if (themeSelect) themeSelect.value = theme;
	}, [theme]);

	return null;
}
