import { h } from 'preact';
import { useEffect } from 'preact/hooks';

// pdf.js is loaded lazily from CDN only on PDF pages. Bundling it would blow
// past the 1 MB vsix budget (~500 KB minified + worker). The <iframe> fallback
// uses the browser's built-in PDF viewer when the CDN is unreachable.
const PDFJS_SRC = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs';
const PDFJS_WORKER_SRC = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs';

function isPdfJs(obj: unknown): boolean {
	return !!obj && typeof obj === 'object'
		&& typeof (obj as any).getDocument === 'function';
}

let pdfjsPromise: Promise<unknown> | null = null;

function ensurePdfJs(): Promise<unknown> {
	const w = window as any;
	if (isPdfJs(w.pdfjsLib)) return Promise.resolve(w.pdfjsLib);
	if (pdfjsPromise) return pdfjsPromise;
	pdfjsPromise = new Promise((resolve) => {
		const script = document.createElement('script');
		script.src = PDFJS_SRC;
		script.onload = () => {
			const lib = w.pdfjsLib;
			if (lib && typeof lib.GlobalWorkerOptions !== 'undefined') {
				lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
			}
			resolve(lib);
		};
		script.onerror = () => { pdfjsPromise = null; resolve(null); };
		document.head.appendChild(script);
	});
	return pdfjsPromise;
}

async function renderPdf(pdfUrl: string, container: HTMLElement): Promise<void> {
	const pdfjs = await ensurePdfJs();
	if (!isPdfJs(pdfjs)) {
		// CDN unavailable — let the iframe fallback handle it
		return;
	}

	try {
		const loadingTask = (pdfjs as any).getDocument({ url: pdfUrl });
		const pdf = await loadingTask.promise;
		const totalPages = pdf.numPages;

		// Create toolbar
		const toolbar = document.createElement('div');
		toolbar.className = 'pdf-toolbar';
		toolbar.innerHTML = `
			<button class="pdf-prev" disabled>&laquo; Prev</button>
			<span class="pdf-page-info">Page <input class="pdf-page-num" type="number" value="1" min="1" max="${totalPages}" /> / ${totalPages}</span>
			<button class="pdf-next" disabled>&raquo; Next</button>
			<span class="pdf-sep"></span>
			<button class="pdf-zoom-out" title="Zoom out">&minus;</button>
			<span class="pdf-zoom-info">100%</span>
			<button class="pdf-zoom-in" title="Zoom in">+</button>
		`;
		container.appendChild(toolbar);

		// Create viewer area
		const viewer = document.createElement('div');
		viewer.className = 'pdf-viewer';
		container.appendChild(viewer);

		let currentPage = 1;
		let scale = 1.5;
		const PAGE_GAP = 8;

		const prevBtn = toolbar.querySelector('.pdf-prev') as HTMLButtonElement;
		const nextBtn = toolbar.querySelector('.pdf-next') as HTMLButtonElement;
		const pageNumInput = toolbar.querySelector('.pdf-page-num') as HTMLInputElement;
		const zoomOutBtn = toolbar.querySelector('.pdf-zoom-out') as HTMLButtonElement;
		const zoomInBtn = toolbar.querySelector('.pdf-zoom-in') as HTMLButtonElement;
		const zoomInfo = toolbar.querySelector('.pdf-zoom-info') as HTMLSpanElement;

		async function renderPage(pageNum: number) {
			const page = await pdf.getPage(pageNum);
			const viewport = page.getViewport({ scale });
			const canvas = document.createElement('canvas');
			const ctx = canvas.getContext('2d')!;
			canvas.width = viewport.width;
			canvas.height = viewport.height;
			canvas.style.width = '100%';
			canvas.style.maxWidth = viewport.width + 'px';
			await page.render({ canvasContext: ctx, viewport }).promise;
			return canvas;
		}

		async function showPage(pageNum: number) {
			if (pageNum < 1 || pageNum > totalPages) return;
			currentPage = pageNum;
			viewer.innerHTML = '';
			const canvas = await renderPage(pageNum);
			viewer.appendChild(canvas);
			pageNumInput.value = String(pageNum);
			prevBtn.disabled = pageNum <= 1;
			nextBtn.disabled = pageNum >= totalPages;
		}

		function updateZoom() {
			zoomInfo.textContent = Math.round(scale * 100 / 1.5) + '%';
		}

		prevBtn.addEventListener('click', () => showPage(currentPage - 1));
		nextBtn.addEventListener('click', () => showPage(currentPage + 1));
		pageNumInput.addEventListener('change', () => {
			const n = parseInt(pageNumInput.value, 10);
			if (!isNaN(n)) showPage(n);
		});
		pageNumInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				const n = parseInt(pageNumInput.value, 10);
				if (!isNaN(n)) showPage(n);
			}
		});
		zoomOutBtn.addEventListener('click', () => {
			scale = Math.max(0.5, scale - 0.25);
			updateZoom();
			showPage(currentPage);
		});
		zoomInBtn.addEventListener('click', () => {
			scale = Math.min(5, scale + 0.25);
			updateZoom();
			showPage(currentPage);
		});

		await showPage(1);
	} catch {
		// PDF.js rendering failed — let iframe fallback take over
	}
}

export function PdfViewer() {
	useEffect(() => {
		const container = document.getElementById('pdf-container');
		const loading = document.getElementById('pdf-loading');
		const fallback = document.getElementById('pdf-fallback') as HTMLIFrameElement;
		if (!container || !fallback) return;

		const id = (window as any).__ONAIR__?.id;
		if (!id) return;

		const pdfUrl = `/preview/${id}/__raw_pdf__`;

		// Show loading state
		if (loading) loading.style.display = 'flex';

		renderPdf(pdfUrl, container).then(() => {
			// Check if pdf.js actually rendered something (toolbar present)
			const hasContent = container.querySelector('.pdf-toolbar');
			if (loading) loading.style.display = 'none';
			if (hasContent) {
				container.style.display = 'flex';
				container.style.flexDirection = 'column';
				fallback.style.display = 'none';
			} else {
				// pdf.js failed or CDN unavailable — use iframe fallback
				container.style.display = 'none';
				fallback.style.display = 'block';
				fallback.src = pdfUrl;
			}
		});
	}, []);

	return null;
}
