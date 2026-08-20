import { h } from 'preact';
import { useEffect } from 'preact/hooks';

// Mermaid is fetched lazily from a CDN only when a document contains diagrams.
// Bundling it would blow past the 1 MB vsix budget (~3 MB minified), and the
// raw source in <pre class="mermaid"> stays visible as a fallback when the
// library can't be reached (offline).
const MERMAID_SRC = 'https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js';

// Theme ids from src/templates/themes.ts that render on a dark background.
const DARK_THEMES = new Set(['vscode-dark', 'github-dark', 'monokai', 'solarized-dark', 'tomorrow-night-blue', 'abyss']);

// Guard against lookalikes: browsers expose id'd elements (e.g. <h1 id="mermaid">)
// as window globals, so check the actual mermaid API shape instead of truthiness.
function isMermaid(obj: unknown): boolean {
	return !!obj && typeof obj === 'object'
		&& typeof (obj as any).initialize === 'function'
		&& typeof (obj as any).run === 'function';
}

let mermaidPromise: Promise<unknown> | null = null;

function ensureMermaid(): Promise<unknown> {
	const w = window as any;
	if (isMermaid(w.mermaid)) return Promise.resolve(w.mermaid);
	if (mermaidPromise) return mermaidPromise;
	mermaidPromise = new Promise((resolve) => {
		const script = document.createElement('script');
		script.src = MERMAID_SRC;
		script.onload = () => resolve(w.mermaid);
		// Resolve with null on failure too; rendering then no-ops and the <pre> fallback stays.
		script.onerror = () => { mermaidPromise = null; resolve(null); };
		document.head.appendChild(script);
	});
	return mermaidPromise;
}

function mermaidTheme(): string {
	const t = document.documentElement.getAttribute('data-theme');
	if (t && t !== 'auto') return DARK_THEMES.has(t) ? 'dark' : 'default';
	return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'default';
}

function renderBlocks(mm: unknown, nodes: HTMLElement[]): void {
	if (!isMermaid(mm) || !nodes.length) return;
	try { (mm as any).initialize({ startOnLoad: false, theme: mermaidTheme(), suppressErrors: true }); } catch { /* ignore */ }
	Promise.resolve((mm as any).run({ nodes })).catch(() => { /* ignore */ });
}

export function Mermaid({ contentEl, contentVersion }: { contentEl: HTMLElement | null; contentVersion: number }) {
	// Render new diagrams whenever content (re)loads or updates.
	useEffect(() => {
		if (!contentEl) return;
		const blocks = Array.from(contentEl.querySelectorAll('pre.mermaid'));
		if (!blocks.length) return;

		let cancelled = false;
		ensureMermaid().then((mm) => {
			if (cancelled || !isMermaid(mm)) return;
			const nodes = blocks.map((pre) => {
				const src = pre.textContent || '';
				const div = document.createElement('div');
				div.className = 'mermaid';
				div.setAttribute('data-mermaid-src', encodeURIComponent(src));
				div.textContent = src;
				pre.replaceWith(div);
				return div;
			});
			renderBlocks(mm, nodes);
		});
		return () => { cancelled = true; };
	}, [contentEl, contentVersion]);

	// Re-render diagrams with the matching theme when the theme changes.
	useEffect(() => {
		if (!contentEl) return;
		const html = document.documentElement;
		const rerender = () => {
			const divs = Array.from(contentEl.querySelectorAll<HTMLElement>('div.mermaid[data-mermaid-src]'));
			const nodes: HTMLElement[] = [];
			for (const div of divs) {
				const src = div.getAttribute('data-mermaid-src');
				if (src == null) continue;
				div.removeAttribute('data-processed');
				div.textContent = decodeURIComponent(src);
				nodes.push(div);
			}
			renderBlocks((window as any).mermaid, nodes);
		};
		const obs = new MutationObserver((mutations) => {
			for (const m of mutations) {
				if (m.type === 'attributes' && m.attributeName === 'data-theme') { rerender(); return; }
			}
		});
		obs.observe(html, { attributes: true, attributeFilter: ['data-theme'] });
		return () => obs.disconnect();
	}, [contentEl]);

	return null;
}