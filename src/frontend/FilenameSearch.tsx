import { h } from 'preact';
import { useState, useMemo } from 'preact/hooks';
import { openFile } from './fileOpen';

export interface FileIndexEntry {
	name: string;
	type: string;
	path: string;
	ext: string;
	size: number;
}

interface Props {
	id: string;
	entries: FileIndexEntry[];
}

function highlightName(name: string, query: string): h.JSX.Element | string {
	if (!query) return name;
	const q = query.toLowerCase();
	const lower = name.toLowerCase();
	const idx = lower.indexOf(q);
	if (idx < 0) return name;
	return (
		<span>
			{name.slice(0, idx)}
			<mark>{name.slice(idx, idx + query.length)}</mark>
			{name.slice(idx + query.length)}
		</span>
	);
}

export function FilenameSearch({ id, entries }: Props) {
	const [query, setQuery] = useState('');

	const results = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return [];
		return entries.filter(e => e.type === 'file' && e.name.toLowerCase().includes(q));
	}, [query, entries]);

	return (
		<div class="fs-root">
			<div class="fs-input-row">
				<input
					class="fs-input"
					type="text"
					placeholder="Search files by name…"
					value={query}
					onInput={(e: h.JSX.TargetedEvent<HTMLInputElement>) => setQuery((e.target as HTMLInputElement).value)}
				/>
			</div>
			{query.trim() && (
				<div class="fs-status">{results.length} file{results.length === 1 ? '' : 's'}</div>
			)}
			<div class="fs-scroll">
				{results.map(e => (
					<div class="fs-file" key={e.path} onClick={() => openFile(id, e.path)} title={e.path}>
						<span class="fs-file-name">{highlightName(e.name, query.trim())}</span>
						<span class="fs-file-path">{e.path}</span>
					</div>
				))}
				{query.trim() && results.length === 0 && <div class="fs-empty">No files found</div>}
			</div>
		</div>
	);
}
