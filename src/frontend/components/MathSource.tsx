import { h } from 'preact';
import { useEffect } from 'preact/hooks';
import { getPopover, hidePopover, showPopover } from '../popover';

function escapeHtml(s: string): string {
	return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function copyText(text: string): Promise<void> {
	if (navigator.clipboard?.writeText) {
		return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
	}
	return Promise.resolve(fallbackCopy(text));
}

function fallbackCopy(text: string): void {
	const ta = document.createElement('textarea');
	ta.value = text;
	ta.style.position = 'fixed';
	ta.style.opacity = '0';
	document.body.appendChild(ta);
	ta.select();
	try { document.execCommand('copy'); } catch { /* ignore */ }
	document.body.removeChild(ta);
}

// Tune these freely to change the hover feel; the value is exposed to the DOM
// (data-math-show-delay) so the e2e tests derive their timings from it instead
// of hardcoding a number.
const SHOW_DELAY_MS = 500;
const HIDE_GRACE_MS = 150;

export function MathSource({ contentEl, contentVersion }: { contentEl: HTMLElement | null; contentVersion: number }) {
	useEffect(() => {
		if (!contentEl) return;

		// Show is deferred so a passing glance over a formula does not flash a
		// popover (noisy). Hiding is also deferred briefly so the cursor can move
		// from the formula onto the popover to reach the copy button.
		document.documentElement.dataset.mathShowDelay = String(SHOW_DELAY_MS);

		let showTimer: number | null = null;
		let hideTimer: number | null = null;

		const cancelShow = () => {
			if (showTimer) { clearTimeout(showTimer); showTimer = null; }
		};
		const scheduleShow = (fn: () => void) => {
			cancelShow();
			showTimer = window.setTimeout(() => { showTimer = null; fn(); }, SHOW_DELAY_MS);
		};
		const scheduleHide = () => {
			cancelShow();
			if (hideTimer) clearTimeout(hideTimer);
			hideTimer = window.setTimeout(hidePopover, HIDE_GRACE_MS);
		};
		const cancelHide = () => {
			if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
		};

		const pop = getPopover();
		pop.addEventListener('mouseenter', cancelHide);
		pop.addEventListener('mouseleave', scheduleHide);

		const els = contentEl.querySelectorAll('.katex-display, .katex');
		for (let i = 0; i < els.length; i++) {
			const el = els[i] as HTMLElement;
			if (el.classList.contains('katex') && !el.classList.contains('katex-display') && el.closest('.katex-display')) continue;

			const ann = el.querySelector('annotation[encoding="application/x-tex"]');
			if (!ann) continue;
			const src = (ann.textContent || '').trim();
			const display = el.classList.contains('katex-display');
			const delim = display ? '$$' : '$';
			const full = delim + src + delim;
			const code = escapeHtml(full);

			el.onmouseenter = (e: MouseEvent) => {
				cancelHide();
				hidePopover();
				scheduleShow(() => {
					showPopover(e,
						'<code>' + code + '</code>' +
						'<button class="math-copy" type="button">Copy</button>',
						'math');
					const btn = document.querySelector('#annot-pop .math-copy');
					if (btn) {
						btn.onclick = (ce: MouseEvent) => {
							ce.stopPropagation();
							copyText(full).then(() => {
								btn.textContent = 'Copied';
								setTimeout(() => { btn.textContent = 'Copy'; }, 1200);
							});
						};
					}
				});
			};
			el.onmouseleave = scheduleHide;
		}

		return () => {
			pop.removeEventListener('mouseenter', cancelHide);
			pop.removeEventListener('mouseleave', scheduleHide);
			if (showTimer) clearTimeout(showTimer);
			if (hideTimer) clearTimeout(hideTimer);
		};
	}, [contentEl, contentVersion]);

	return null;
}