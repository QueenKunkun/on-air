import { h } from 'preact';

interface TocHeaderProps {
	title: string;
	fullPath: string;
	relPath?: string;
	collapsedAll: boolean;
	onToggleAll: () => void;
}

export function TocHeader({ title, fullPath, relPath, collapsedAll, onToggleAll }: TocHeaderProps) {
	return (
		<div id="toc-header" title={fullPath}>
			<div class="toc-title-row">
				<span id="tocTitle" title={fullPath}>{title}</span>
				<button class="toc-copy" title="Copy full path" onClick={() => navigator.clipboard.writeText(fullPath).catch(() => {})}>{'\uD83D\uDCCB'}</button>
				<button class="toc-m" title={collapsedAll ? 'Expand all' : 'Collapse all'} onClick={onToggleAll}>{collapsedAll ? '+' : '\u2212'}</button>
			</div>
			{relPath && <div class="toc-path" title={fullPath}>{relPath}</div>}
		</div>
	);
}
