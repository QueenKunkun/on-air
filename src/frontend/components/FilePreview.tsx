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

	const isJson = /\.json$/i.test(filePath);
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
							<span class="fl-text">{isJson ? highlightJson(text) : text}</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function highlightJson(line: string): h.JSX.Element[] {
	const tokens: h.JSX.Element[] = [];
	let remaining = line;
	let key = 0;

	const re = /("(?:[^"\\]|\\.)*")\s*:/g;
	const strRe = /"(?:[^"\\]|\\.)*"/g;
	const numRe = /\b-?\d+\.?\d*(?:[eE][+-]?\d+)?\b/g;
	const boolNullRe = /\b(?:true|false|null)\b/g;

	// Simple line-by-line tokenization: split by key patterns first, then highlight values
	let lastIdx = 0;
	const parts: { text: string; cls?: string }[] = [];

	// Match "key": patterns
	re.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = re.exec(remaining)) !== null) {
		if (m.index > lastIdx) {
			parts.push({ text: remaining.slice(lastIdx, m.index) });
		}
		parts.push({ text: m[0], cls: 'hl-key' });
		lastIdx = m.index + m[0].length;
	}
	if (lastIdx < remaining.length) {
		parts.push({ text: remaining.slice(lastIdx) });
	}

	// Now highlight string values, numbers, booleans inside each part
	return parts.flatMap((part, pi) => {
		if (part.cls) {
			// Already highlighted as key — just wrap the key name
			const km = part.text.match(/^("(?:[^"\\]|\\.)*")\s*:/);
			if (km) {
				return [
					<span key={pi} class="hl-key">{km[1]}</span>,
					<span key={pi + '.c'}>:</span>,
				];
			}
			return [<span key={pi} class={part.cls}>{part.text}</span>];
		}
		// Highlight values in plain parts
		const result: h.JSX.Element[] = [];
		let last = 0;
		const src = part.text;

		// Strings (values)
		strRe.lastIndex = 0;
		const allMatches: { idx: number; len: number; cls: string }[] = [];
		let sm: RegExpExecArray | null;
		while ((sm = strRe.exec(src)) !== null) {
			allMatches.push({ idx: sm.index, len: sm[0].length, cls: 'hl-str' });
		}
		// Numbers
		numRe.lastIndex = 0;
		let nm: RegExpExecArray | null;
		while ((nm = numRe.exec(src)) !== null) {
			// skip if inside a string
			const insideStr = allMatches.some(m => nm!.index >= m.idx && nm!.index < m.idx + m.len);
			if (!insideStr) allMatches.push({ idx: nm.index, len: nm[0].length, cls: 'hl-num' });
		}
		// Booleans / null
		boolNullRe.lastIndex = 0;
		let bm: RegExpExecArray | null;
		while ((bm = boolNullRe.exec(src)) !== null) {
			const insideStr = allMatches.some(m => bm!.index >= m.idx && bm!.index < m.idx + m.len);
			if (!insideStr) allMatches.push({ idx: bm.index, len: bm[0].length, cls: 'hl-bool' });
		}

		allMatches.sort((a, b) => a.idx - b.idx);

		last = 0;
		for (const m of allMatches) {
			if (m.idx > last) result.push(<span key={`${pi}-${last}`}>{src.slice(last, m.idx)}</span>);
			result.push(<span key={`${pi}-${m.idx}`} class={m.cls}>{src.slice(m.idx, m.idx + m.len)}</span>);
			last = m.idx + m.len;
		}
		if (last < src.length) result.push(<span key={`${pi}-end`}>{src.slice(last)}</span>);
		return result;
	});
}
