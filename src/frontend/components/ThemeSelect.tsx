import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

interface ThemeOption {
	id: string;
	label: string;
}

interface ThemeSelectProps {
	themes: ThemeOption[];
	value: string;
	onChange: (id: string) => void;
}

function iconOf(label: string): string {
	return label.split(' ')[0] || '🎨';
}

export function ThemeSelect({ themes, value, onChange }: ThemeSelectProps) {
	const [open, setOpen] = useState(false);
	const wrapRef = useRef<HTMLDivElement>(null);
	const current = themes.find(t => t.id === value);

	// Close on outside click or Escape
	useEffect(() => {
		if (!open) return;
		const onDown = (e: MouseEvent) => {
			if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setOpen(false);
		};
		document.addEventListener('mousedown', onDown);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('mousedown', onDown);
			document.removeEventListener('keydown', onKey);
		};
	}, [open]);

	return (
		<div ref={wrapRef} class="theme-wrap" id="themeSelect">
			<button class="theme-btn" title={current?.label || 'Theme'}
				aria-haspopup="listbox" aria-expanded={open}
				onClick={() => setOpen(o => !o)}>
				{iconOf(current?.label || 'Theme')}
			</button>
			{open && (
				<ul class="theme-menu" role="listbox">
					{themes.map(t => (
						<li key={t.id} role="option" aria-selected={t.id === value}
							class={t.id === value ? 'active' : ''}
							onClick={() => { onChange(t.id); setOpen(false); }}>
							{t.label}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}