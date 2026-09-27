import { h, Fragment } from 'preact';
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useDropdown } from '../hooks/useDropdown';
import { LS_KEYS } from '../../common/localStorageKeys';

interface DiffRange { type: 'add' | 'del'; startLine: number; endLine: number; }
interface DiffResponse { ranges: DiffRange[]; source: string; toHtml?: string | null; error?: string; }
interface Commit { hash: string; shortHash: string; message: string; }

type DiffMode = 'auto' | 'workspace' | 'HEAD~1' | 'commits';

export function DiffButton() {
	const [enabled, setEnabled] = useLocalStorage<boolean>(LS_KEYS.DIFF_ENABLED, false);
	const [mode, setMode] = useLocalStorage<DiffMode>(LS_KEYS.DIFF_MODE, 'auto');
	const [commits, setCommits] = useState<Commit[]>([]);
	const [showCommitPicker, setShowCommitPicker] = useState(false);
	const [fromCommit, setFromCommit] = useState('');
	const [toCommit, setToCommit] = useState('');
	const dd = useDropdown({ triggerSelector: '.tb-diff-caret' });

	const id = window.__ONAIR__?.id || '';

	// Re-position when commit picker expands the menu
	useEffect(() => { /* dropdown hook re-positions on `open` change */ }, [dd.open, showCommitPicker]);

	// Fetch commits when commit picker opens
	useEffect(() => {
		if (!showCommitPicker || !id) return;
		fetch(`/api/diff/commits?id=${id}`)
			.then(r => r.json())
			.then(d => setCommits(d.commits || []))
			.catch(() => {});
	}, [showCommitPicker, id]);

	// Save original content on mount, restore when diff disabled
	const originalContentRef = useRef<string | null>(null);

	// Apply/remove diff highlighting
	const applyDiff = useCallback(async () => {
		if (!enabled || !id) return;
		let url = `/api/diff?id=${id}`;
		if (mode === 'workspace') url += '&range=workspace';
		else if (mode === 'HEAD~1') url += '&range=HEAD~1';
		else if (mode === 'commits' && fromCommit && toCommit) url += `&range=commits&from=${fromCommit}&to=${toCommit}`;
		console.log('[diff] fetch:', url);
		try {
			const res = await fetch(url);
			const data: DiffResponse = await res.json();
			console.log('[diff] ranges:', data.ranges.length, 'toHtml:', data.toHtml ? data.toHtml.length + ' chars' : 'null');
			const content = document.getElementById('content');
			if (!content) return;

			// Save original content once
			if (originalContentRef.current === null) {
				originalContentRef.current = content.innerHTML;
			}

			// Swap content if "to" side is a commit
			if (data.toHtml) {
				content.innerHTML = data.toHtml;
			} else if (originalContentRef.current !== null) {
				content.innerHTML = originalContentRef.current;
			}

			// Apply highlighting
			document.querySelectorAll('.diff-add, .diff-del').forEach(el => {
				el.classList.remove('diff-add', 'diff-del');
			});
			for (const range of data.ranges) {
				for (let line = range.startLine; line <= range.endLine; line++) {
					const el = document.querySelector(`[data-src-line="${line}"]`);
					if (el) el.classList.add(range.type === 'add' ? 'diff-add' : 'diff-del');
				}
			}
		} catch {}
	}, [enabled, id, mode, fromCommit, toCommit]);

	useEffect(() => { applyDiff(); }, [applyDiff]);

	// Clear and restore original on disable
	useEffect(() => {
		if (!enabled) {
			document.querySelectorAll('.diff-add, .diff-del').forEach(el => {
				el.classList.remove('diff-add', 'diff-del');
			});
			const content = document.getElementById('content');
			if (content && originalContentRef.current !== null) {
				content.innerHTML = originalContentRef.current;
			}
		}
	}, [enabled]);

	const handleModeSelect = useCallback((m: DiffMode) => {
		if (m === 'commits') { setShowCommitPicker(true); return; }
		setMode(m);
		if (!enabled) setEnabled(true);
		dd.close();
		setShowCommitPicker(false);
	}, [setMode, dd, enabled, setEnabled]);

	const handleCommitConfirm = useCallback(() => {
		if (fromCommit && toCommit) {
			setMode('commits');
			if (!enabled) setEnabled(true);
			dd.close();
			setShowCommitPicker(false);
		}
	}, [fromCommit, toCommit, setMode, dd, enabled, setEnabled]);

	const modeLabel = mode === 'workspace' ? 'Workspace vs HEAD'
		: mode === 'HEAD~1' ? 'HEAD vs HEAD~1'
		: mode === 'commits'
			? `${fromCommit === 'workspace' ? 'Workspace' : fromCommit.slice(0, 7)} → ${toCommit === 'workspace' ? 'Workspace' : toCommit.slice(0, 7)}`
			: 'Workspace vs last change';

	return (
		<div class={'tb-diff-wrap' + (enabled ? ' tb-diff-on' : '')} ref={dd.wrapRef}>
			<button
				class="tb-diff-btn"
				title={enabled ? `Hide diff (${modeLabel})` : `Show diff (${modeLabel})`}
				onClick={() => setEnabled(!enabled)}
			>
				<span class="tb-diff-icon">±</span>
			</button>
			<button class="tb-diff-caret" title="Diff options" onClick={dd.toggle}>
				<svg width="8" height="8" viewBox="0 0 10 10" fill="currentColor" style="pointer-events:none"><path d="M2 3.5L5 6.5L8 3.5Z" /></svg>
			</button>
			{enabled && <span class="tb-diff-label" title={modeLabel}>{modeLabel}</span>}
			{dd.open && (
				<div ref={dd.menuRef} class="tb-diff-menu">
					{!showCommitPicker ? (
						<>
							<div class="tb-diff-menu-label">Compare</div>
							<button class={'tb-diff-menu-item' + (mode === 'auto' ? ' tb-diff-menu-active' : '')} onClick={() => handleModeSelect('auto')}>
								Workspace vs last change
							</button>
							<button class={'tb-diff-menu-item' + (mode === 'workspace' ? ' tb-diff-menu-active' : '')} onClick={() => handleModeSelect('workspace')}>
								Workspace vs HEAD
							</button>
							<button class={'tb-diff-menu-item' + (mode === 'HEAD~1' ? ' tb-diff-menu-active' : '')} onClick={() => handleModeSelect('HEAD~1')}>
								HEAD vs HEAD~1
							</button>
							<div class="tb-diff-menu-sep" />
							<button class={'tb-diff-menu-item' + (mode === 'commits' ? ' tb-diff-menu-active' : '')} onClick={() => handleModeSelect('commits')}>
								Select commits…
							</button>
						</>
					) : (
						<>
							<div class="tb-diff-menu-label">From (older)</div>
							<div class="tb-diff-commit-list">
								<button
									class="tb-diff-commit-item"
									disabled
									title="Workspace is always newest — cannot be the older side"
								>
									<span class="tb-diff-commit-hash">WORK</span>
									<span class="tb-diff-commit-msg">Workspace</span>
								</button>
								{commits.map(c => (
									<button
										class={'tb-diff-commit-item' + (fromCommit === c.hash ? ' tb-diff-menu-active' : '')}
										onClick={() => setFromCommit(c.hash)}
									>
										<span class="tb-diff-commit-hash">{c.shortHash}</span>
										<span class="tb-diff-commit-msg">{c.message}</span>
									</button>
								))}
							</div>
							<div class="tb-diff-swap-row">
								<button
									class="tb-diff-swap"
									title="Swap from/to"
									disabled={!fromCommit && !toCommit}
									onClick={() => { const f = fromCommit; setFromCommit(toCommit); setToCommit(f); }}
								>
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
										<path d="M7 16V4m0 0L3 8m4-4l4 4" />
										<path d="M17 8v12m0 0l4-4m-4 4l-4-4" />
									</svg>
									Swap
								</button>
							</div>
							<div class="tb-diff-menu-label">To (newer)</div>
							<div class="tb-diff-commit-list">
								<button
									class={'tb-diff-commit-item' + (toCommit === 'workspace' ? ' tb-diff-menu-active' : '')}
									onClick={() => setToCommit('workspace')}
								>
									<span class="tb-diff-commit-hash">WORK</span>
									<span class="tb-diff-commit-msg">Workspace</span>
								</button>
								{commits.map(c => (
									<button
										class={'tb-diff-commit-item' + (toCommit === c.hash ? ' tb-diff-menu-active' : '')}
										onClick={() => setToCommit(c.hash)}
									>
										<span class="tb-diff-commit-hash">{c.shortHash}</span>
										<span class="tb-diff-commit-msg">{c.message}</span>
									</button>
								))}
							</div>
							<div class="tb-diff-menu-sep" />
							<div class="tb-diff-menu-actions">
								<button
									class="tb-diff-menu-item tb-diff-menu-cancel"
									onClick={() => { setShowCommitPicker(false); }}
								>
									Cancel
								</button>
								<button
									class="tb-diff-menu-item tb-diff-menu-confirm"
									disabled={!fromCommit || !toCommit || fromCommit === toCommit}
									onClick={handleCommitConfirm}
								>
									Compare
								</button>
							</div>
						</>
					)}
				</div>
			)}
		</div>
	);
}
