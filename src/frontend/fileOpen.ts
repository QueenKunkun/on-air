import { h, render } from 'preact';
import { MARKDOWN_EXTS, isMarkdownExt, isCodeExt } from '../common/extensions';
import { FilePreview, FilePreviewError, FilePreviewBinary, FilePreviewCode } from './components/FilePreview';

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
	const goBack = () => { document.getElementById('tabTree')?.click(); };

	if (line != null) {
		const params = 'id=' + encodeURIComponent(id) + '&path=' + encodeURIComponent(filePath) + '&line=' + encodeURIComponent(String(line));
		fetch('/api/file?' + params)
			.then(r => r.json())
			.then(data => {
				if (data.error) { render(h(FilePreviewError, { error: data.error, onBack: goBack }), contentEl); return; }
				if (data.isBinary) { render(h(FilePreviewBinary, { filePath, onBack: goBack }), contentEl); return; }
				render(h(FilePreviewCode, { filePath, content: data.content, onBack: goBack, line }), contentEl);
			})
			.catch(() => render(h(FilePreviewError, { error: 'Error loading file', onBack: goBack }), contentEl));
		return;
	}

	if (isTextFile(filePath) || isImageFile(filePath)) {
		location.href = '/preview/' + id + '/' + encodeURIComponent(filePath);
		return;
	}
	if (isCodeFile(filePath)) {
		const params = 'id=' + encodeURIComponent(id) + '&path=' + encodeURIComponent(filePath);
		fetch('/api/file?' + params)
			.then(r => r.json())
			.then(data => {
				if (data.error) { render(h(FilePreviewError, { error: data.error, onBack: goBack }), contentEl); return; }
				if (data.isBinary) { render(h(FilePreviewBinary, { filePath, onBack: goBack }), contentEl); return; }
				render(h(FilePreviewCode, { filePath, content: data.content, onBack: goBack }), contentEl);
			})
			.catch(() => render(h(FilePreviewError, { error: 'Error loading file', onBack: goBack }), contentEl));
		return;
	}
	const params = 'id=' + encodeURIComponent(id) + '&path=' + encodeURIComponent(filePath);
	fetch('/api/file?' + params)
		.then(r => r.json())
		.then(data => {
			if (data.error) { render(h(FilePreviewError, { error: data.error, onBack: goBack }), contentEl); return; }
			if (data.isBinary) { render(h(FilePreviewBinary, { filePath, onBack: goBack }), contentEl); return; }
			render(h(FilePreviewCode, { filePath, content: data.content, onBack: goBack }), contentEl);
		})
		.catch(() => render(h(FilePreviewError, { error: 'Error loading file', onBack: goBack }), contentEl));
}

export { FilePreview };
