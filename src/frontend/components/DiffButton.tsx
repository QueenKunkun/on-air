import { h } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useDropdown } from '../hooks/useDropdown';
import { LS_KEYS } from '../../common/localStorageKeys';

interface DiffRange { type: 'add' | 'del'; startLine: number; endLine: number; }
interface DiffResponse { ranges: DiffRange[]; source: string; error?: string; }
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

	// Apply/remove diff highlighting
	const applyDiff = useCallback(async () => {
		if (!enabled || !id) return;
		let url = `/api/diff?id=${id}`;
		if (mode === 'workspace') url += '&range=workspace';
		else if (mode === 'HEAD~1') url += '&range=HEAD~1';
		else if (mode === 'commits' && fromCommit && toCommit) url += `&range=commits&from=${fromCommit}&to=${toCommit}`;
		try {
			const res = await fetch(url);
			const data: DiffResponse = await res.json();
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

	// Clear on disable
	useEffect(() => {
		if (!enabled) {
			document.querySelectorAll('.diff-add, .diff-del').forEach(el => {
				el.classList.remove('diff-add', 'diff-del');
			});
		}
	}, [enabled]);

	const handleModeSelect = useCallback((m: DiffMode) => {
		if (m === 'commits') { setShowCommitPicker(true); return; }
		setMode(m);
		dd.close();
		setShowCommitPicker(false);
	}, [setMode, dd]);

	const handleCommitConfirm = useCallback(() => {
		if (fromCommit && toCommit) {
			setMode('commits');
			dd.close();
			setShowCommitPicker(false);
		}
	}, [fromCommit, toCommit, setMode, dd]);

	return (
		<div class={'tb-diff-wrap' + (enabled ? ' tb-diff-on' : '')} ref={dd.wrapRef}>
			<button
				class="tb-diff-btn"
				title={enabled ? 'Hide diff highlights' : 'Show diff highlights'}
				onClick={() => setEnabled(!enabled)}
			>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M6 9l-3 3 3 3" />
					<path d="M18 9l3 3-3 3" />
					<path d="M14 5l-4 14" />
				</svg>
			</button>
			<button class="tb-diff-caret" title="Diff options" onClick={dd.toggle}>
				<svg width="8" height="8" viewBox="0 0 10 10" fill="currentColor" style="pointer-events:none"><path d="M2 3.5L5 6.5L8 3.5Z" /></svg>
			</button>
			{dd.open && (
				<div ref={dd.menuRef} class="tb-diff-menu">
					{!showCommitPicker ? (
						<>
							<div class="tb-diff-menu-label">Compare</div>
							<button class={'tb-diff-menu-item' + (mode === 'auto' ? ' tb-diff-menu-active' : '')} onClick={() => handleModeSelect('auto')}>
								Auto (workspace → last change)
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
							<div class="tb-diff-menu-label">From commit</div>
							<div class="tb-diff-commit-list">
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
							<div class="tb-diff-menu-label">To commit</div>
							<div class="tb-diff-commit-list">
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
							<button
								class="tb-diff-menu-item tb-diff-menu-confirm"
								disabled={!fromCommit || !toCommit}
								onClick={handleCommitConfirm}
							>
								Compare
							</button>
						</>
					)}
				</div>
			)}
		</div>
	);
}
