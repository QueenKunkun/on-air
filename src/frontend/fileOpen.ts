import { MARKDOWN_EXTS, isMarkdownExt, isCodeExt } from '../common/extensions';

export function isTextFile(p: string): boolean {
	const ext = p.toLowerCase().split('.').pop() || '';
	return isMarkdownExt('.' + ext) || ext === 'html' || ext === 'htm';
}

function isCodeFile(p: string): boolean {
	const ext = p.toLowerCase().split('.').pop() || '';
	return isCodeExt('.' + ext);
}

export function isImageFile(p: string): boolean {
	const l = p.toLowerCase();
	return /\.(png|jpe?g|gif|webp|avif|bmp|ico|svg)$/.test(l);
}

function escHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function highlightJsonLine(line: string): string {
	return line
		.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
		.replace(/("(?:[^"\\]|\\.)*")\s*:/g, '<span class="hl-key">$1</span>:')
		.replace(/:(\s*)("(?:[^"\\]|\\.)*")/g, ':<span class="hl-str">$1$2</span>')
		.replace(/:\s*(-?\d+\.?\d*(?:[eE][+-]?\d+)?)/g, ': <span class="hl-num">$1</span>')
		.replace(/:\s*\b(true|false|null)\b/g, ': <span class="hl-bool">$1</span>');
}

/**
 * Render a code file view into #content using plain DOM.
 * Also updates file tree highlight and hides TOC (code files have no headings).
 */
function renderCodeFile(filePath: string, content: string, line?: number): void {
	const contentEl = document.getElementById('content');
	if (!contentEl) return;

	const lines = content.split('\n');
	const isJson = /\.json$/i.test(filePath);
	const back = '<button onclick="document.getElementById(\'tabTree\')?.click()">← Back</button>';
	const header = `<div class="file-view-header">${back}<span class="file-path">${escHtml(filePath)}</span></div>`;

	const rows = lines.map((text, i) => {
		const n = i + 1;
		const hl = line != null && n === line ? ' fl-hl' : '';
		const display = isJson ? highlightJsonLine(text) : escHtml(text);
		return `<div class="fl-line${hl}"><span class="fl-num">${n}</span><span class="fl-text">${display}</span></div>`;
	}).join('');

	contentEl.innerHTML = `<div class="file-view">${header}<div class="file-code">${rows}</div></div>`;

	// Update file tree highlight
	const ftRoot = document.getElementById('ft-preact-root');
	if (ftRoot) {
		const rootDir = ftRoot.getAttribute('data-rootdir') || '';
		ftRoot.setAttribute('data-fullpath', rootDir + filePath);
	}

	// Hide TOC — code files have no headings
	const tocCol = document.getElementById('tocCol');
	if (tocCol) tocCol.style.display = 'none';

	// Scroll to highlighted line
	if (line != null) {
		const hit = contentEl.querySelector('.fl-hl');
		if (hit) hit.scrollIntoView({ block: 'center' });
	}
}

function renderError(msg: string): void {
	const contentEl = document.getElementById('content');
	if (!contentEl) return;
	const back = '<button onclick="document.getElementById(\'tabTree\')?.click()">← Back</button>';
	contentEl.innerHTML = `<div class="file-view"><div class="file-view-header">${back}<span class="file-path">Error: ${escHtml(msg)}</span></div></div>`;
}

function renderBinary(filePath: string): void {
	const contentEl = document.getElementById('content');
	if (!contentEl) return;
	const back = '<button onclick="document.getElementById(\'tabTree\')?.click()">← Back</button>';
	contentEl.innerHTML = `<div class="file-view"><div class="file-view-header">${back}<span class="file-path">${escHtml(filePath)}</span></div><div class="file-binary">Binary file, cannot preview</div></div>`;
}

/**
 * Open a file in the preview pane.
 * - Markdown/html/images: full page navigation to /preview/<id>/<path>
 * - Code files (json/js/ts/css/txt/log): inline code view with syntax highlighting
 * - Search results (with line): always show code view with matched line highlighted
 */
export function openFile(id: string, filePath: string, line?: number): void {
	const contentEl = document.getElementById('content');
	if (!contentEl) return;

	// Search result — always show code view with line highlight
	if (line != null) {
		const params = 'id=' + encodeURIComponent(id) + '&path=' + encodeURIComponent(filePath) + '&line=' + encodeURIComponent(String(line));
		fetch('/api/file?' + params)
			.then(r => r.json())
			.then(data => {
				if (data.error) { renderError(data.error); return; }
				if (data.isBinary) { renderBinary(filePath); return; }
				renderCodeFile(filePath, data.content, line);
			})
			.catch(() => renderError('Error loading file'));
		return;
	}

	// Markdown/html → full page navigation
	if (isTextFile(filePath) || isImageFile(filePath)) {
		// Restore TOC visibility before navigating (next page will set it correctly)
		const tocCol = document.getElementById('tocCol');
		if (tocCol) tocCol.style.display = '';
		location.href = '/preview/' + id + '/' + encodeURIComponent(filePath);
		return;
	}

	// Code files → inline code view
	const params = 'id=' + encodeURIComponent(id) + '&path=' + encodeURIComponent(filePath);
	fetch('/api/file?' + params)
		.then(r => r.json())
		.then(data => {
			if (data.error) { renderError(data.error); return; }
			if (data.isBinary) { renderBinary(filePath); return; }
			renderCodeFile(filePath, data.content);
		})
		.catch(() => renderError('Error loading file'));
}
