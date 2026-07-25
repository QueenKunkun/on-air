import { useEffect } from 'preact/hooks';
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
		let didDrag = false;
		let rafId = 0;
		let pendingSize: number | null = null;

		function onMouseDown(e: MouseEvent) {
			startPos = opts.axis === 'x' ? e.clientX : e.clientY;
			startSize = opts.get(targetEl);
			didDrag = false;
			resizerEl.classList.add('active');
			document.addEventListener('mousemove', onMouseMove);
			document.addEventListener('mouseup', onMouseUp);
			e.preventDefault();
		}

		function onMouseMove(e: MouseEvent) {
			const pos = opts.axis === 'x' ? e.clientX : e.clientY;
			let delta = pos - startPos;
			if (opts.invert) delta = -delta;
			if (Math.abs(delta) > 2) {
				didDrag = true;
				resizerEl.setAttribute('data-dragging', '1');
			}
			const size = Math.max(opts.min, Math.min(opts.max, startSize + delta));
			// Throttle CSS variable updates to once per animation frame to prevent
			// layout thrashing (高频 reflow) that causes text to jump around.
			pendingSize = size;
			if (!rafId) {
				rafId = requestAnimationFrame(() => {
					rafId = 0;
					if (pendingSize !== null) {
						opts.set(targetEl, pendingSize);
						pendingSize = null;
					}
				});
			}
		}

		function onMouseUp() {
			// Apply any pending update immediately
			if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
			if (pendingSize !== null) {
				opts.set(targetEl, pendingSize);
				pendingSize = null;
			}
			resizerEl.classList.remove('active');
			document.removeEventListener('mousemove', onMouseMove);
			document.removeEventListener('mouseup', onMouseUp);
			localStorage.setItem(opts.key, String(opts.get(targetEl)));
			// Clear dragging flag after click event has had time to fire
			if (didDrag) {
				setTimeout(() => resizerEl.removeAttribute('data-dragging'), 100);
			}
		}

		resizerEl.addEventListener('mousedown', onMouseDown);
		return () => {
			if (rafId) { cancelAnimationFrame(rafId); }
			resizerEl.removeEventListener('mousedown', onMouseDown);
			document.removeEventListener('mousemove', onMouseMove);
			document.removeEventListener('mouseup', onMouseUp);
		};
	}, deps);
}
