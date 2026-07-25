import { h } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

interface CardEntry {
	id: string;
	mark: HTMLElement;
	card: HTMLDivElement;
}

export function Annotations({ contentEl, contentVersion }: { contentEl: HTMLElement | null; contentVersion: number }) {
	const hoverOn = useRef(localStorage.getItem('onair-annot-hover') === '1');
	const cardRegistry = useRef<CardEntry[]>([]);
	const popRef = useRef<HTMLDivElement | null>(null);

	const hidePopover = () => {
		if (popRef.current) popRef.current.style.display = 'none';
	};

	const showPopover = (evt: MouseEvent, htmlStr: string) => {
		const pop = popRef.current;
		if (!pop) return;
		pop.innerHTML = htmlStr;
		pop.style.display = 'block';
		pop.style.left = '0px';
		pop.style.top = '0px';
		const el = (evt.currentTarget || evt.target) as HTMLElement;
		const r = el.getBoundingClientRect();
		const ph = pop.offsetHeight;
		const pw = pop.offsetWidth;
		const gap = 30;
		let top = r.bottom + gap;
		if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 12);
		let left = r.left;
		if (left + pw > window.innerWidth - 8) left = Math.max(8, window.innerWidth - pw - 8);
		pop.style.top = (top + window.pageYOffset) + 'px';
		pop.style.left = (left + window.pageXOffset) + 'px';
	};

	const annotColumnVisible = () => {
		const side = document.getElementById('annotSide');
		return side && getComputedStyle(side).display !== 'none' && !side.classList.contains('collapsed');
	};

	const activate = (aid: string, scroll: boolean) => {
		for (const entry of cardRegistry.current) {
			const on = entry.id === aid;
			entry.mark.classList.toggle('active', on);
			entry.card.classList.toggle('active', on);
			entry.card.style.zIndex = on ? '5' : '';
			if (on && scroll) entry.card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		}
	};

	const markDocY = (el: Element) => el.getBoundingClientRect().top + window.pageYOffset;

	const layoutCards = () => {
		const registry = cardRegistry.current;
		if (!registry.length) return;
		const side = document.getElementById('annotSide');
		if (side?.classList.contains('collapsed')) return;
		const annots = document.getElementById('annots');
		const content = document.getElementById('content');
		if (!annots || !content) return;
		annots.style.minHeight = content.offsetHeight + 'px';
		const base = markDocY(annots);
		const items = registry.slice().sort((a, b) => markDocY(a.mark) - markDocY(b.mark));
		let prevBottom = -1e9;
		for (const item of items) {
			const natural = markDocY(item.mark) - base;
			const y = Math.max(natural, prevBottom + 12);
			item.card.style.top = y + 'px';
			prevBottom = y + item.card.offsetHeight;
		}
	};

	const prevMark = (ref: Element): Element | null => {
		let n = ref.previousSibling;
		while (n && n.nodeType === 3 && !/\S/.test(n.textContent || '')) n = n.previousSibling;
		if (n && n.nodeType === 1 && (n as Element).tagName === 'MARK') return n;
		return null;
	};

	useEffect(() => {
		if (!contentEl) return;

		// Create popover
		const pop = document.createElement('div');
		pop.id = 'annot-pop';
		pop.style.display = 'none';
		document.body.appendChild(pop);
		popRef.current = pop;

		const side = document.getElementById('annotSide');
		const annots = document.getElementById('annots');
		const resizer = document.getElementById('annotResizer');

		function buildAnnotations() {
			if (!annots || !side) return;
			annots.innerHTML = '';
			cardRegistry.current = [];

			const refs = contentEl!.querySelectorAll('sup.footnote-ref');
			const sec = contentEl!.querySelector('section.footnotes');
			const liById: Record<string, HTMLLIElement> = {};
			if (sec) {
				const lis = sec.querySelectorAll('li.footnote-item');
				for (let i = 0; i < lis.length; i++) liById[lis[i].id] = lis[i] as HTMLLIElement;
			}

			let annId = 0;
			for (let r = 0; r < refs.length; r++) {
				const ref = refs[r];
				const markEl = prevMark(ref);
				if (!markEl) {
					const a = ref.querySelector('a');
					const fli = a && liById[(a.getAttribute('href') || '').replace(/^#/, '')];
					if (fli) {
						const fclone = fli.cloneNode(true) as HTMLLIElement;
						const fback = fclone.querySelector('.footnote-backref');
						if (fback) fback.parentNode?.removeChild(fback);
						const htmlStr = fclone.innerHTML;
						(ref as HTMLElement).onmouseenter = (e: MouseEvent) => { if (hoverOn.current) showPopover(e, htmlStr); };
						(ref as HTMLElement).onmouseleave = () => { if (hoverOn.current) hidePopover(); };
					}
					continue;
				}
				const a = ref.querySelector('a');
				if (!a) continue;
				const fnId = (a.getAttribute('href') || '').replace(/^#/, '');
				const li = liById[fnId];
				if (!li) continue;

				annId++;
				const aid = 'a' + annId;
				(markEl as HTMLElement).setAttribute('data-annot-id', aid);
				(markEl as HTMLElement).classList.add('annot-mark');
				(ref as HTMLElement).style.display = 'none';

				const card = document.createElement('div');
				card.className = 'annot-card';
				card.setAttribute('data-annot-id', aid);
				const clone = li.cloneNode(true) as HTMLLIElement;
				const back = clone.querySelector('.footnote-backref');
				if (back) back.parentNode?.removeChild(back);
				card.innerHTML = clone.innerHTML;
				annots.appendChild(card);
				li.parentNode?.removeChild(li);

				cardRegistry.current.push({ id: aid, mark: markEl as HTMLElement, card });

				((id: string, mark: HTMLElement, cardEl: HTMLDivElement, htmlStr: string) => {
					mark.onclick = (e: MouseEvent) => {
						if (annotColumnVisible()) { activate(id, true); }
						else { showPopover(e, htmlStr); e.stopPropagation(); }
					};
					cardEl.onclick = () => { activate(id, false); };
					mark.onmouseenter = (e: MouseEvent) => {
						if (!hoverOn.current) return;
						if (annotColumnVisible()) activate(id, false); else showPopover(e, htmlStr);
					};
					mark.onmouseleave = () => { if (hoverOn.current && !annotColumnVisible()) hidePopover(); };
					cardEl.onmouseenter = () => { if (hoverOn.current) activate(id, false); };
				})(aid, markEl as HTMLElement, card, card.innerHTML);
			}

			if (sec && !sec.querySelector('li.footnote-item')) {
				const sep = contentEl!.querySelector('hr.footnotes-sep');
				if (sep) sep.parentNode?.removeChild(sep);
				sec.innerHTML = '';
			}

			const has = cardRegistry.current.length > 0;
			side.style.display = has ? '' : 'none';
			if (resizer) resizer.style.display = (has && !side.classList.contains('collapsed')) ? '' : 'none';
			if (has) layoutCards();
		}

		// Annotation column resize
		function onResizerMouseDown(e: MouseEvent) {
			startPos = e.clientX;
			startSize = side!.offsetWidth;
			resizer!.classList.add('active');
			document.addEventListener('mousemove', onResizerMouseMove);
			document.addEventListener('mouseup', onResizerMouseUp);
			e.preventDefault();
		}
		function onResizerMouseMove(e: MouseEvent) {
			const size = Math.max(120, startSize - (e.clientX - startPos));
			side!.style.width = size + 'px';
		}
		function onResizerMouseUp() {
			resizer!.classList.remove('active');
			localStorage.setItem('onair-annot-width', String(side!.offsetWidth));
			document.removeEventListener('mousemove', onResizerMouseMove);
			document.removeEventListener('mouseup', onResizerMouseUp);
		}
		let startPos = 0;
		let startSize = 0;
		if (resizer && side) {
			resizer.addEventListener('mousedown', onResizerMouseDown);
		}

		// Annotation column collapse handle
		const handle = document.getElementById('annotToggle');
		function setAnnotCollapsed(c: boolean) {
			side!.classList.toggle('collapsed', c);
			handle!.textContent = c ? '<' : '>';
			handle!.title = c ? 'Show annotations' : 'Hide annotations';
			if (cardRegistry.current.length && resizer) resizer.style.display = c ? 'none' : '';
			localStorage.setItem('onair-annot-collapsed', c ? '1' : '0');
			if (!c) layoutCards();
		}
		setAnnotCollapsed(localStorage.getItem('onair-annot-collapsed') === '1');
		function onToggleClick() { setAnnotCollapsed(!side!.classList.contains('collapsed')); }
		handle?.addEventListener('click', onToggleClick);

		// Hover preview
		const hoverBtn = document.getElementById('hoverBtn');
		function onHoverBtnClick() {
			hoverOn.current = !hoverOn.current;
			hoverBtn!.classList.toggle('on', hoverOn.current);
			localStorage.setItem('onair-annot-hover', hoverOn.current ? '1' : '0');
			if (!hoverOn.current) hidePopover();
		}
		if (hoverBtn) {
			if (hoverOn.current) hoverBtn.classList.add('on');
			hoverBtn.addEventListener('click', onHoverBtnClick);
		}

		// Click outside popover to close
		function onDocClick(e: MouseEvent) {
			if (pop.style.display !== 'none' && !pop.contains(e.target as Node) && !(e.target as HTMLElement)?.closest?.('.annot-mark')) {
				hidePopover();
			}
		}
		document.addEventListener('click', onDocClick);

		buildAnnotations();

		return () => {
			if (resizer) resizer.removeEventListener('mousedown', onResizerMouseDown);
			handle?.removeEventListener('click', onToggleClick);
			hoverBtn?.removeEventListener('click', onHoverBtnClick);
			document.removeEventListener('click', onDocClick);
			pop.remove();
		};
	}, [contentEl, contentVersion]);

	useEffect(() => {
		const onResize = () => { layoutCards(); hidePopover(); };
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
	}, []);

	return null;
}
