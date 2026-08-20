import { h } from 'preact';
import { useState } from 'preact/hooks';

interface TocHeaderProps {
	title: string;
	fullPath: string;
	relPath?: string;
	collapsedAll: boolean;
	onToggleAll: () => void;
}

export function TocHeader({ title, fullPath, relPath, collapsedAll, onToggleAll }: TocHeaderProps) {
	const [copied, setCopied] = useState(false);

	const handleCopy = () => {
		navigator.clipboard.writeText(fullPath).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		}).catch(() => {});
	};

	return (
		<div id="toc-header" title={fullPath}>
			<div class="toc-title-row">
				<span id="tocTitle" title={fullPath}>{title}</span>
				<button class={`toc-copy${copied ? ' copied' : ''}`} title={copied ? 'Copied' : 'Copy full path'} onClick={handleCopy}>{copied ? '\u2713' : '\uD83D\uDCCB'}</button>
				<button class="toc-m" title={collapsedAll ? 'Expand all' : 'Collapse all'} onClick={onToggleAll}>{collapsedAll ? '+' : '\u2212'}</button>
				<button class="toc-x" title="Hide table of contents" onClick={() => window.dispatchEvent(new CustomEvent('onair:collapse-toc'))}>{'\u00D7'}</button>
			</div>
			{relPath && <div class="toc-path" title={fullPath}>{relPath}</div>}
		</div>
	);
}
