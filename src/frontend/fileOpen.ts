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

function showCodeView(contentEl: HTMLElement, filePath: string, content: string, line?: number) {
	const lines = content.split('\n');
	const isJson = /\.json$/i.test(filePath);
	const back = '<button onclick="document.getElementById(\'tabTree\')?.click()">← Back</button>';
	const header = `<div class="file-view-header">${back}<span class="file-path">${filePath}</span></div>`;

	const rows = lines.map((text, i) => {
		const n = i + 1;
		const hl = line != null && n === line ? ' fl-hl' : '';
		const display = isJson ? highlightJsonLine(text) : escHtml(text);
		return `<div class="fl-line${hl}"><span class="fl-num">${n}</span><span class="fl-text">${display}</span></div>`;
	}).join('');

	contentEl.innerHTML = `<div class="file-view">${header}<div class="file-code">${rows}</div></div>`;

	if (line != null) {
		const hit = contentEl.querySelector('.fl-hl');
		if (hit) hit.scrollIntoView({ block: 'center' });
	}
}

function showError(contentEl: HTMLElement, msg: string) {
	const back = '<button onclick="document.getElementById(\'tabTree\')?.click()">← Back</button>';
	contentEl.innerHTML = `<div class="file-view"><div class="file-view-header">${back}<span class="file-path">Error: ${escHtml(msg)}</span></div></div>`;
}

function showBinary(contentEl: HTMLElement, filePath: string) {
	const back = '<button onclick="document.getElementById(\'tabTree\')?.click()">← Back</button>';
	contentEl.innerHTML = `<div class="file-view"><div class="file-view-header">${back}<span class="file-path">${escHtml(filePath)}</span></div><div class="file-binary">Binary file, cannot preview</div></div>`;
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
 * Open a file in the preview pane.
 * - With `line` (search results): always show the raw code view with the matched
 *   line highlighted and scrolled into view — works for any text file.
 * - Without `line` (file-tree click): markdown/html/images navigate to the rendered
 *   preview; other text/binary files use the code/binary preview.
 */
export function openFile(id: string, filePath: string, line?: number): void {
	const contentEl = document.getElementById('content');
	if (!contentEl) return;

	if (line != null) {
		const params = 'id=' + encodeURIComponent(id) + '&path=' + encodeURIComponent(filePath) + '&line=' + encodeURIComponent(String(line));
		fetch('/api/file?' + params)
			.then(r => r.json())
			.then(data => {
				if (data.error) { showError(contentEl, data.error); return; }
				if (data.isBinary) { showBinary(contentEl, filePath); return; }
				showCodeView(contentEl, filePath, data.content, line);
			})
			.catch(() => showError(contentEl, 'Error loading file'));
		return;
	}

	if (isTextFile(filePath) || isImageFile(filePath)) {
		location.href = '/preview/' + id + '/' + encodeURIComponent(filePath);
		return;
	}
	const params = 'id=' + encodeURIComponent(id) + '&path=' + encodeURIComponent(filePath);
	fetch('/api/file?' + params)
		.then(r => r.json())
		.then(data => {
			if (data.error) { showError(contentEl, data.error); return; }
			if (data.isBinary) { showBinary(contentEl, filePath); return; }
			showCodeView(contentEl, filePath, data.content);
		})
		.catch(() => showError(contentEl, 'Error loading file'));
}
