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

async function renderAllPages(pdfUrl: string, container: HTMLElement): Promise<boolean> {
	const pdfjs = await ensurePdfJs();
	if (!isPdfJs(pdfjs)) return false;

	try {
		const loadingTask = (pdfjs as any).getDocument({ url: pdfUrl });
		const pdf = await loadingTask.promise;
		const totalPages = pdf.numPages;

		// Render all pages vertically (continuous scroll)
		for (let i = 1; i <= totalPages; i++) {
			const page = await pdf.getPage(i);
			const viewport = page.getViewport({ scale: 1.5 });

			const canvas = document.createElement('canvas');
			canvas.width = viewport.width;
			canvas.height = viewport.height;
			canvas.style.width = viewport.width + 'px';
			canvas.style.maxWidth = '100%';
			canvas.style.boxShadow = '0 2px 8px rgba(0,0,0,.3)';
			canvas.style.borderRadius = '2px';

			container.appendChild(canvas);

			const ctx = canvas.getContext('2d')!;
			await page.render({ canvasContext: ctx, viewport }).promise;
		}
		return true;
	} catch {
		return false;
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

		if (loading) loading.style.display = 'flex';

		renderAllPages(pdfUrl, container).then((ok) => {
			if (loading) loading.style.display = 'none';
			if (ok && container.children.length > 0) {
				container.style.display = 'flex';
				fallback.style.display = 'none';
			} else {
				container.style.display = 'none';
				fallback.style.display = 'block';
				fallback.src = pdfUrl;
			}
		});
	}, []);

	return null;
}
