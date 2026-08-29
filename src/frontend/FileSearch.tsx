import { h } from 'preact';
import { useState, useCallback, useEffect, useRef } from 'preact/hooks';
import { openFile } from './fileOpen';
import type { SearchResult } from '../routes/search';

interface Props {
	id: string;
}

type Status = 'idle' | 'searching' | 'done' | 'error';

function buildRegex(q: string, caseSensitive: boolean): RegExp | null {
	try { return new RegExp(q, caseSensitive ? 'g' : 'gi'); } catch { return null; }
}

function highlight(text: string, q: string, useRegex: boolean, caseSensitive: boolean): string | h.JSX.Element[] {
	if (!q) return text;
	if (useRegex) {
		const re = buildRegex(q, caseSensitive);
		if (!re) return text;
		const out: h.JSX.Element[] = [];
		let last = 0;
		let m: RegExpExecArray | null;
		while ((m = re.exec(text)) !== null) {
			if (m.index > last) out.push(text.slice(last, m.index));
			out.push(h('mark', null, m[0]));
			last = m.index + m[0].length;
			if (m[0].length === 0) { re.lastIndex++; }
		}
		if (last < text.length) out.push(text.slice(last));
		return out.length ? out : text;
	}
	const needle = caseSensitive ? q : q.toLowerCase();
	const hay = caseSensitive ? text : text.toLowerCase();
	const out: h.JSX.Element[] = [];
	let last = 0;
	let idx: number;
	while ((idx = hay.indexOf(needle, last)) >= 0) {
		if (idx > last) out.push(text.slice(last, idx));
		out.push(h('mark', null, text.slice(idx, idx + needle.length)));
		last = idx + needle.length;
	}
	if (last < text.length) out.push(text.slice(last));
	return out.length ? out : text;
}

export function FileSearch({ id }: Props) {
	const [query, setQuery] = useState('');
	const [useRegex, setUseRegex] = useState(false);
	const [caseSensitive, setCaseSensitive] = useState(false);
	const [glob, setGlob] = useState('');
	const [results, setResults] = useState<SearchResult[]>([]);
	const [status, setStatus] = useState<Status>('idle');
	const [truncated, setTruncated] = useState(false);
	const [engine, setEngine] = useState<string>('');
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const runSearch = useCallback(() => {
		const q = query.trim();
		if (!q) {
			setResults([]);
			setStatus('idle');
			setTruncated(false);
			return;
		}
		setStatus('searching');
		const params = new URLSearchParams({ id, q, max: '200' });
		if (useRegex) params.set('regex', '1');
		if (caseSensitive) params.set('caseSensitive', '1');
		if (glob.trim()) params.set('glob', glob.trim());
		fetch('/api/search?' + params.toString())
			.then(r => r.json())
			.then((data: { results: SearchResult[]; truncated: boolean; engine: string; error?: string }) => {
				if (data.error) { setStatus('error'); setResults([]); return; }
				setResults(data.results);
				setTruncated(!!data.truncated);
				setEngine(data.engine);
				setStatus('done');
			})
			.catch(() => { setStatus('error'); setResults([]); });
	}, [id, query, useRegex, caseSensitive, glob]);

	// Debounced auto-search on input change.
	useEffect(() => {
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(runSearch, 300);
		return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
	}, [runSearch]);

	// Group results by file, preserving first-seen order.
	const groups: Array<{ file: string; items: SearchResult[] }> = [];
	const order = new Map<string, number>();
	for (const r of results) {
		let gi = order.get(r.file);
		if (gi === undefined) {
			gi = groups.length;
			order.set(r.file, gi);
			groups.push({ file: r.file, items: [] });
		}
		groups[gi].items.push(r);
	}

	return (
		<div class="fs-root">
			<div class="fs-input-row">
				<input
					class="fs-input"
					type="text"
					placeholder="Search in files…"
					value={query}
					onInput={(e: h.JSX.TargetedEvent<HTMLInputElement>) => setQuery((e.target as HTMLInputElement).value)}
					onKeydown={(e: h.JSX.TargetedKeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') runSearch(); }}
				/>
				<button class="fs-search-btn" onClick={() => runSearch()} title="Search">🔍</button>
			</div>
			<div class="fs-options">
				<label><input type="checkbox" checked={useRegex} onChange={() => setUseRegex(v => !v)} /> .*</label>
				<label><input type="checkbox" checked={caseSensitive} onChange={() => setCaseSensitive(v => !v)} /> Aa</label>
				<input class="fs-glob" type="text" placeholder="*.md" value={glob} onInput={(e: h.JSX.TargetedEvent<HTMLInputElement>) => setGlob((e.target as HTMLInputElement).value)} />
			</div>
			<div class="fs-status">
				{status === 'searching' && <span>Searching…</span>}
				{status === 'done' && <span>{results.length} result{results.length === 1 ? '' : 's'}{truncated ? ' (truncated)' : ''}{engine ? ` · ${engine}` : ''}</span>}
				{status === 'error' && <span class="fs-error">Search failed</span>}
			</div>
			<div class="fs-scroll">
				{groups.map(g => (
					<div class="fs-group">
						<div class="fs-file" onClick={() => openFile(id, g.file)} title={g.file}>
							<span class="fs-file-name">{g.file.split('/').pop()}</span>
							<span class="fs-file-path">{g.file}</span>
							<span class="fs-file-count">{g.items.length}</span>
						</div>
						{g.items.map((it, i) => (
							<div class="fs-match" onClick={() => openFile(id, g.file, it.line)} title={`Line ${it.line}`}>
								<span class="fs-line">{it.line}</span>
								<span class="fs-text">{highlight(it.text, query.trim(), useRegex, caseSensitive)}</span>
							</div>
						))}
					</div>
				))}
				{status === 'done' && results.length === 0 && <div class="fs-empty">No results</div>}
			</div>
		</div>
	);
}
