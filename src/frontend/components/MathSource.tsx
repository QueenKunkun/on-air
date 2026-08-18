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

export function MathSource({ contentEl, contentVersion }: { contentEl: HTMLElement | null; contentVersion: number }) {
	useEffect(() => {
		if (!contentEl) return;

		// Moving the cursor from a formula onto the popover must not dismiss it
		// instantly, or the copy button would be unreachable. Defer the hide by
		// a short grace period and cancel it when the cursor enters the popover.
		let hideTimer: number | null = null;
		const scheduleHide = () => {
			if (hideTimer) clearTimeout(hideTimer);
			hideTimer = window.setTimeout(hidePopover, 150);
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
			};
			el.onmouseleave = scheduleHide;
		}

		return () => {
			pop.removeEventListener('mouseenter', cancelHide);
			pop.removeEventListener('mouseleave', scheduleHide);
			if (hideTimer) clearTimeout(hideTimer);
		};
	}, [contentEl, contentVersion]);

	return null;
}