import { h } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

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

export function FilePreviewCode({ filePath, content, onBack, line }: { filePath: string; content: string; onBack: () => void; line?: number }) {
	const rootRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (line == null) return;
		const el = rootRef.current?.querySelector('.fl-hl');
		if (el) {
			el.scrollIntoView({ block: 'center' });
		}
	}, [line, content]);

	const lines = content.split('\n');

	return (
		<div class="file-view">
			<div class="file-view-header">
				<button onClick={onBack}>{'← Back'}</button>
				<span class="file-path">{filePath}</span>
			</div>
			<div class="file-code" ref={rootRef}>
				{lines.map((text, i) => {
					const n = i + 1;
					const isHit = line != null && n === line;
					return (
						<div class={'fl-line' + (isHit ? ' fl-hl' : '')}>
							<span class="fl-num">{n}</span>
							<span class="fl-text">{text}</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}
