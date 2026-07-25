export interface ResizerOpts {
	axis: 'x' | 'y';
	invert: boolean;
	key: string;
	def: number | null;
	min: number;
	max: number;
	get: (el: HTMLElement) => number;
	set: (el: HTMLElement, v: number) => void;
}

/* Backward-compatible string export for html-snippet.html inline scripts */
export const tocJs = `
function buildTocTree(hs, container) {
	var root = document.createElement('ul');
	var stack = [{el:root,lv:0}];
	for (var i = 0; i < hs.length; i++) {
		var h = hs[i], lv = +h.tagName[1], txt = h.textContent, id = h.id;
		while (stack.length > 1 && stack[stack.length-1].lv >= lv) stack.pop();
		var parent = stack[stack.length-1];
		var li = document.createElement('li');
		var row = document.createElement('div');
		row.className = 'r';
		var a = document.createElement('a');
		a.href = '#' + id;
		a.textContent = txt;
		a.title = txt;
		row.appendChild(a);
		li.appendChild(row);
		var sub = document.createElement('ul');
		li.appendChild(sub);
		parent.el.appendChild(li);
		stack.push({el:sub,lv:lv,li:li,row:row});
	}
	var uls = root.querySelectorAll('ul');
	for (var i = 0; i < uls.length; i++) {
		var u = uls[i];
		if (!u.children.length) { u.remove(); continue; }
		var p = u.parentNode;
		if (p && p.tagName === 'LI') {
			var r = p.querySelector('.r');
			if (!r) continue;
			var btn = document.createElement('button');
			btn.className = 't';
			btn.textContent = '\\u2212';
			btn.title = 'Collapse';
			btn.onclick = (function(sub) {
				return function() {
					sub.classList.toggle('c');
					this.textContent = sub.classList.contains('c') ? '+' : '\\u2212';
					this.title = sub.classList.contains('c') ? 'Expand' : 'Collapse';
				};
			})(u);
			r.insertBefore(btn, r.firstChild);
		}
	}
	var allRows = root.querySelectorAll('.r');
	for (var i = 0; i < allRows.length; i++) {
		var row = allRows[i];
		if (!row.querySelector('.t')) {
			var sp = document.createElement('span');
			sp.className = 's';
			row.insertBefore(sp, row.firstChild);
		}
	}
	container.appendChild(root);
	return root;
}
function buildTocHeader(toc, titleText, fullPath, relPath) {
	var hdr = document.createElement('div');
	hdr.id = 'toc-header';
	hdr.title = fullPath;
	var titleRow = document.createElement('div');
	titleRow.className = 'toc-title-row';
	var titleSpan = document.createElement('span');
	titleSpan.id = 'tocTitle';
	titleSpan.textContent = titleText;
	titleSpan.title = fullPath;
	titleRow.appendChild(titleSpan);
	var copyBtn = document.createElement('button');
	copyBtn.className = 'toc-copy';
	copyBtn.textContent = '\\uD83D\\uDCCB';
	copyBtn.title = 'Copy full path';
	copyBtn.onclick = function () { navigator.clipboard.writeText(fullPath).catch(function(){}); };
	titleRow.appendChild(copyBtn);
	var master = document.createElement('button');
	master.className = 'toc-m';
	master.textContent = '\\u2212';
	master.title = 'Collapse all';
	titleRow.appendChild(master);
	hdr.appendChild(titleRow);
	if (relPath) {
		var pathEl = document.createElement('div');
		pathEl.className = 'toc-path';
		pathEl.textContent = relPath;
		pathEl.title = fullPath;
		hdr.appendChild(pathEl);
	}
	toc.appendChild(hdr);
	return master;
}
function initMasterToggle(tocContainer, masterBtn) {
	masterBtn.onclick = function() {
		var collapsed = this.textContent === '+';
		this.textContent = collapsed ? '\\u2212' : '+';
		this.title = collapsed ? 'Collapse all' : 'Expand all';
		var subs = tocContainer.querySelectorAll('ul ul');
		var btns = tocContainer.querySelectorAll('.t');
		for (var i = 0; i < subs.length; i++) subs[i].classList.toggle('c', !collapsed);
		for (var i = 0; i < btns.length; i++) {
			btns[i].textContent = collapsed ? '\\u2212' : '+';
			btns[i].title = collapsed ? 'Collapse' : 'Expand';
		}
	};
}
function bindTocInteractions(tocEl, contentEl, offset) {
	var hs = contentEl.querySelectorAll('h1,h2,h3,h4,h5,h6');
	var links = tocEl.querySelectorAll('a');
	var map = [];
	for (var i = 0; i < hs.length && i < links.length; i++) map.push([hs[i], links[i]]);
	for (var j = 0; j < map.length; j++) {
		(function (h, a) {
			a.onclick = function (e) { e.preventDefault(); h.scrollIntoView({ behavior: 'smooth' }); };
		})(map[j][0], map[j][1]);
	}
	function updateActiveToc() {
		var active = null;
		for (var k = 0; k < map.length; k++) {
			if (map[k][0].getBoundingClientRect().top <= (offset || 80)) active = map[k][1];
			else break;
		}
		for (var m = 0; m < map.length; m++) map[m][1].classList.toggle('active', map[m][1] === active);
		if (active) {
			var scrollEl = active.closest ? active.closest('#toc-list') : null;
			var sl = scrollEl ? scrollEl.scrollLeft : 0;
			active.scrollIntoView({ block: 'nearest' });
			if (scrollEl) scrollEl.scrollLeft = sl;
		}
	}
	var ticking = false;
	document.addEventListener('scroll', function () {
		if (!ticking) {
			window.requestAnimationFrame(function () { updateActiveToc(); ticking = false; });
			ticking = true;
		}
	});
	updateActiveToc();
}
function buildRelatedLinks(tocEl, rootEl) {
	var seen = {};
	var items = [];
	var anchors = rootEl.querySelectorAll('a');
	for (var i = 0; i < anchors.length; i++) {
		var a = anchors[i];
		if (tocEl.contains(a)) continue;
		var href = a.getAttribute('href') || '';
		if (href.slice(0, 2) === '//') continue;
		if (/^[a-z][a-z0-9+.-]*:|#|data:/i.test(href)) continue;
		// NOTE: Keep in sync with src/common/extensions.ts MARKDOWN_EXTS
		if (!/\\.(md|markdown|mdx|html?)([#?].*)?$/i.test(href)) continue;
		var key = href.replace(/^\\.\\//, '').replace(/[#?].*$/, '');
		if (seen[key]) continue;
		seen[key] = true;
		var label = (a.textContent || '').trim();
		items.push({ href: href, label: label });
	}
	if (!items.length) return;
	var wrap = document.createElement('div');
	wrap.id = 'toc-related';
	var resizer = document.createElement('div');
	resizer.className = 'toc-related-resizer';
	resizer.style.height = '4px';
	resizer.style.cursor = 'row-resize';
	resizer.style.flexShrink = '0';
	wrap.appendChild(resizer);
	var hdr = document.createElement('div');
	hdr.className = 'toc-related-h';
	hdr.textContent = 'Related';
	wrap.appendChild(hdr);
	for (var j = 0; j < items.length; j++) {
		var item = items[j];
		var row = document.createElement('a');
		row.className = 'toc-related-item';
		row.href = item.href;
		row.textContent = item.label || item.href;
		row.title = item.href;
		wrap.appendChild(row);
	}
	tocEl.appendChild(wrap);
	attachResizer(resizer, wrap, {
		axis: 'y', invert: true, key: 'onair-related-height', def: 200, min: 120, max: 480,
		get: function (el) { return el.offsetHeight; },
		set: function (el, v) { el.style.height = v + 'px'; }
	});
}
function attachResizer(resizerEl, targetEl, opts) {
	var saved = parseInt(localStorage.getItem(opts.key), 10);
	if (!isNaN(saved)) {
		opts.set(targetEl, saved);
	} else if (opts.def != null) {
		opts.set(targetEl, opts.def);
	}
	var startPos, startSize;
	resizerEl.onmousedown = function (e) {
		startPos = (opts.axis === 'x') ? e.clientX : e.clientY;
		startSize = opts.get(targetEl);
		resizerEl.classList.add('active');
		document.addEventListener('mousemove', onMove);
		document.addEventListener('mouseup', onUp);
		e.preventDefault();
	};
	function onMove(e) {
		var pos = (opts.axis === 'x') ? e.clientX : e.clientY;
		var delta = pos - startPos;
		if (opts.invert) delta = -delta;
		var size = Math.max(opts.min, Math.min(opts.max, startSize + delta));
		opts.set(targetEl, size);
	}
	function onUp() {
		resizerEl.classList.remove('active');
		document.removeEventListener('mousemove', onMove);
		document.removeEventListener('mouseup', onUp);
		localStorage.setItem(opts.key, String(opts.get(targetEl)));
	}
}
`;
