import { useEffect, useRef } from 'preact/hooks';

export function useScrollSpy(
	contentEl: HTMLElement | null,
	headings: Element[],
	links: HTMLAnchorElement[],
	offset: number = 80
) {
	const activeRef = useRef<HTMLAnchorElement | null>(null);

	useEffect(() => {
		if (!contentEl || !headings.length || !links.length) return;

		const map: [Element, HTMLAnchorElement][] = [];
		const len = Math.min(headings.length, links.length);
		for (let i = 0; i < len; i++) map.push([headings[i], links[i]]);

		// Click handlers
		for (const [h, a] of map) {
			a.onclick = (e: Event) => {
				e.preventDefault();
				h.scrollIntoView({ behavior: 'smooth' });
			};
		}

		function updateActive() {
			let active: HTMLAnchorElement | null = null;
			for (const [h, a] of map) {
				if (h.getBoundingClientRect().top <= offset) active = a;
				else break;
			}
			if (active !== activeRef.current) {
				if (activeRef.current) activeRef.current.classList.remove('active');
				if (active) active.classList.add('active');
				activeRef.current = active;
			}
		if (active) {
			const scrollEl = active.closest('#toc-list') as HTMLElement | null;
			if (scrollEl) {
				const sl = scrollEl.scrollLeft;
				const linkTop = active.offsetTop;
				const linkHeight = active.offsetHeight;
				const st = scrollEl.scrollTop;
				const vh = scrollEl.clientHeight;
				if (linkTop < st) {
					scrollEl.scrollTop = linkTop;
				} else if (linkTop + linkHeight > st + vh) {
					scrollEl.scrollTop = linkTop + linkHeight - vh;
				}
				scrollEl.scrollLeft = sl;
			}
		}
		}

		let ticking = false;
		const onScroll = () => {
			if (!ticking) {
				window.requestAnimationFrame(() => { updateActive(); ticking = false; });
				ticking = true;
			}
		};

		document.addEventListener('scroll', onScroll);
		updateActive();

		return () => {
			document.removeEventListener('scroll', onScroll);
			for (const [, a] of map) a.onclick = null;
		};
	}, [contentEl, headings, links, offset]);
}
