import { h } from 'preact';

interface FilePreviewProps {
	filePath: string;
	id: string;
	onBack: () => void;
}

export function FilePreview({ filePath, id, onBack }: FilePreviewProps) {
	const isImage = /\.(png|jpe?g|gif|webp|avif|bmp|ico|svg)$/i.test(filePath);
	const back = <button onClick={onBack}>{'← Back'}</button>;

	if (isImage) {
		const imgSrc = '/preview/' + id + '/' + encodeURIComponent(filePath);
		return (
			<div class="file-view">
				<div class="file-view-header">
					{back}
					<span class="file-path">{filePath}</span>
				</div>
				<div class="file-image">
					<img src={imgSrc} />
				</div>
			</div>
		);
	}

	return null;
}

export function FilePreviewError({ error, onBack }: { error: string; onBack: () => void }) {
	return (
		<div class="file-view">
			<div class="file-view-header">
				<button onClick={onBack}>{'← Back'}</button>
				<span class="file-path">Error: {error}</span>
			</div>
		</div>
	);
}

export function FilePreviewBinary({ filePath, onBack }: { filePath: string; onBack: () => void }) {
	return (
		<div class="file-view">
			<div class="file-view-header">
				<button onClick={onBack}>{'← Back'}</button>
				<span class="file-path">{filePath}</span>
			</div>
			<div class="file-binary">Binary file, cannot preview</div>
		</div>
	);
}

export function FilePreviewCode({ filePath, content, onBack }: { filePath: string; content: string; onBack: () => void }) {
	return (
		<div class="file-view">
			<div class="file-view-header">
				<button onClick={onBack}>{'← Back'}</button>
				<span class="file-path">{filePath}</span>
			</div>
			<pre><code class="hljs">{content}</code></pre>
		</div>
	);
}
