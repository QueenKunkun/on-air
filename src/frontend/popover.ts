let pop: HTMLDivElement | null = null;

export function getPopover(): HTMLDivElement {
	if (!pop) {
		pop = document.createElement('div');
		pop.id = 'annot-pop';
		pop.style.display = 'none';
		document.body.appendChild(pop);
	}
	return pop;
}

export function showPopover(evt: MouseEvent, htmlStr: string, extraClass?: string) {
	const el = (evt.currentTarget || evt.target) as HTMLElement;
	showPopoverAt(el, htmlStr, extraClass);
}

export function showPopoverAt(el: HTMLElement, htmlStr: string, extraClass?: string) {
	const pop = getPopover();
	pop.innerHTML = htmlStr;
	pop.classList.toggle('cite', extraClass === 'cite');
	pop.classList.toggle('math', extraClass === 'math');
	pop.style.display = 'block';
	pop.style.left = '0px';
	pop.style.top = '0px';
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
}

export function hidePopover() {
	if (pop) pop.style.display = 'none';
}
