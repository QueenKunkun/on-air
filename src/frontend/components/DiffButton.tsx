import { h, Fragment } from 'preact';
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { useLocalStorage, isFlagOn } from '../hooks/useLocalStorage';
import { LS_KEYS } from '../../common/localStorageKeys';

interface DiffRange { type: 'add' | 'del'; startLine: number; endLine: number; }
interface DiffResponse { ranges: DiffRange[]; source: string; toHtml?: string | null; error?: string; }
interface Commit { hash: string; shortHash: string; message: string; }

export function DiffButton() {
	const [enabledStr, setEnabledStr] = useLocalStorage(LS_KEYS.DIFF_ENABLED, '0');
	const enabled = isFlagOn(enabledStr);
	const setEnabled = (v: boolean) => setEnabledStr(v ? '1' : '0');
	const [fromRef, setFromRef] = useLocalStorage<string>(LS_KEYS.DIFF_FROM, 'workspace');
	const [toRef, setToRef] = useLocalStorage<string>(LS_KEYS.DIFF_TO, 'HEAD');
	const [commits, setCommits] = useState<Commit[]>([]);
	const [diffStatus, setDiffStatus] = useState<'idle' | 'loading' | 'none' | 'has'>('idle');
	const originalContentRef = useRef<string | null>(null);
	// Which commit's HTML is currently displayed (null = original workspace DOM).
	// Used to skip redundant innerHTML replacement that flashes the page.
	const showingCommitRef = useRef<string | null>(null);

	const id = window.__ONAIR__?.id || '';

	// Fetch commits on mount
	useEffect(() => {
		if (!id) return;
		fetch(`/api/diff/commits?id=${id}`)
			.then(r => r.json())
			.then(d => setCommits(d.commits || []))
			.catch(() => {});
	}, [id]);

	// Monotonic id for diff requests. Rapid select switches fire overlapping
	// fetches; only the latest request may touch the DOM (older responses
	// arriving late are stale and must be ignored).
	const reqSeqRef = useRef(0);

	// Apply/remove diff highlighting
	const applyDiff = useCallback(async () => {
		const seq = ++reqSeqRef.current;
		if (!enabled || !id || !fromRef || !toRef || fromRef === toRef) { setDiffStatus('idle'); return; }
		setDiffStatus('loading');
		const url = `/api/diff?id=${id}&range=commits&from=${fromRef}&to=${toRef}`;
		try {
			const res = await fetch(url);
			const data: DiffResponse = await res.json();
			if (seq !== reqSeqRef.current) return; // superseded by a newer request
			const content = document.getElementById('content');
			if (!content) return;

			if (originalContentRef.current === null) {
				originalContentRef.current = content.innerHTML;
			}

			if (data.toHtml) {
				// Only replace DOM when the displayed side actually changes
				if (showingCommitRef.current !== toRef) {
					content.innerHTML = data.toHtml;
					showingCommitRef.current = toRef;
				}
			} else if (showingCommitRef.current !== null && originalContentRef.current !== null) {
				content.innerHTML = originalContentRef.current;
				showingCommitRef.current = null;
			}

			document.querySelectorAll('.diff-add, .diff-del').forEach(el => {
				el.classList.remove('diff-add', 'diff-del');
			});
			let count = 0;
			for (const range of data.ranges) {
				for (let line = range.startLine; line <= range.endLine; line++) {
					const el = document.querySelector(`[data-src-line="${line}"]`);
					if (el) { el.classList.add(range.type === 'add' ? 'diff-add' : 'diff-del'); count++; }
				}
			}
			setDiffStatus(count > 0 ? 'has' : 'none');
		} catch {}
	}, [enabled, id, fromRef, toRef]);

	useEffect(() => { applyDiff(); }, [applyDiff]);

	// Clear and restore original on disable (only if we replaced it)
	useEffect(() => {
		if (!enabled) {
			reqSeqRef.current++; // invalidate any in-flight fetch
			document.querySelectorAll('.diff-add, .diff-del').forEach(el => {
				el.classList.remove('diff-add', 'diff-del');
			});
			const content = document.getElementById('content');
			if (content && originalContentRef.current !== null && showingCommitRef.current !== null) {
				content.innerHTML = originalContentRef.current;
				showingCommitRef.current = null;
			}
		}
	}, [enabled]);

	const swap = useCallback(() => {
		const f = fromRef;
		setFromRef(toRef);
		setToRef(f);
	}, [fromRef, toRef, setFromRef, setToRef]);

	const renderOptions = (selected: string) => (
		<>
			<option value="workspace">Workspace</option>
			<option value="HEAD">HEAD</option>
			{commits.map(c => (
				<option value={c.hash}>{c.shortHash} {c.message.slice(0, 30)}</option>
			))}
		</>
	);

	return (
		<div class={'tb-diff-wrap' + (enabled ? ' tb-diff-on' : '')}>
			<button
				class="tb-diff-btn"
				title={enabled ? 'Hide diff highlights' : 'Show diff highlights'}
				onClick={() => setEnabled(!enabled)}
			>
				<span class="tb-diff-icon">±</span>
			</button>
			<select
				class="tb-diff-select"
				disabled={!enabled}
				value={fromRef}
				onChange={e => setFromRef((e.target as HTMLSelectElement).value)}
			>
				{renderOptions(fromRef)}
			</select>
			<button
				class="tb-diff-swap-btn"
				title="Swap comparison direction"
				disabled={!enabled}
				onClick={swap}
			>
				<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M4 7h16m0 0l-4-4m4 4l-4 4" />
					<path d="M20 17H4m0 0l4-4m-4 4l4 4" />
				</svg>
			</button>
			<select
				class="tb-diff-select"
				disabled={!enabled}
				value={toRef}
				onChange={e => setToRef((e.target as HTMLSelectElement).value)}
			>
				{renderOptions(toRef)}
			</select>
			{enabled && (
				<span
					class={'tb-diff-status ' + (diffStatus === 'has' ? 'tb-diff-status--has' : 'tb-diff-status--none')}
					style={diffStatus === 'has' || diffStatus === 'none' ? undefined : 'visibility:hidden'}
				>
					{diffStatus === 'has' ? 'Diff' : 'No changes'}
				</span>
			)}
			{enabled && commits.length === 0 && (
				<span class="tb-diff-status tb-diff-status--none" title="This file has no git history">No history</span>
			)}
		</div>
	);
}
