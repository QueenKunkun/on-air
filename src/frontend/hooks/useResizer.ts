import { useEffect, useRef } from 'preact/hooks';
import type { ResizerOpts } from '../../templates/toc-common';

export function useResizer(
	resizerRef: { current: HTMLElement | null },
	targetRef: { current: HTMLElement | null },
	opts: ResizerOpts,
	deps: unknown[] = [],
) {
	useEffect(() => {
		const resizerEl = resizerRef.current;
		const targetEl = targetRef.current;
		if (!resizerEl || !targetEl) return;

		const saved = parseInt(localStorage.getItem(opts.key) || '', 10);
		if (!isNaN(saved)) {
			opts.set(targetEl, saved);
		} else if (opts.def != null) {
			opts.set(targetEl, opts.def);
		}

		let startPos = 0;
		let startSize = 0;

		function onMouseDown(e: MouseEvent) {
			startPos = opts.axis === 'x' ? e.clientX : e.clientY;
			startSize = opts.get(targetEl);
			resizerEl.classList.add('active');
			document.addEventListener('mousemove', onMouseMove);
			document.addEventListener('mouseup', onMouseUp);
			e.preventDefault();
		}

		function onMouseMove(e: MouseEvent) {
			const pos = opts.axis === 'x' ? e.clientX : e.clientY;
			let delta = pos - startPos;
			if (opts.invert) delta = -delta;
			const size = Math.max(opts.min, Math.min(opts.max, startSize + delta));
			opts.set(targetEl, size);
		}

		function onMouseUp() {
			resizerEl.classList.remove('active');
			document.removeEventListener('mousemove', onMouseMove);
			document.removeEventListener('mouseup', onMouseUp);
			localStorage.setItem(opts.key, String(opts.get(targetEl)));
		}

		resizerEl.addEventListener('mousedown', onMouseDown);
		return () => {
			resizerEl.removeEventListener('mousedown', onMouseDown);
			document.removeEventListener('mousemove', onMouseMove);
			document.removeEventListener('mouseup', onMouseUp);
		};
	}, deps);
}
