import { useEffect, useRef, useState, useCallback } from 'preact/hooks';

interface UseDropdownOptions {
	/** CSS class of the trigger button used for positioning (queried inside wrapRef) */
	triggerSelector: string;
	/** Offset from trigger bottom edge to menu top */
	offsetTop?: number;
	/** Close when clicking a menu item (default true) */
	closeOnSelect?: boolean;
}

/**
 * Shared dropdown positioning + outside-close logic.
 * Used by ThemeSelect, CopyPathButton, DiffButton, and future dropdowns.
 *
 * Pattern:
 *   const dd = useDropdown({ triggerSelector: '.tb-x-caret' });
 *   <div ref={dd.wrapRef}> ... <button onClick={dd.toggle}/> <div ref={dd.menuRef} hidden={!dd.open}> ... </div></div>
 */
export function useDropdown({ triggerSelector, offsetTop = 4, closeOnSelect = true }: UseDropdownOptions) {
	const [open, setOpen] = useState(false);
	const wrapRef = useRef<HTMLDivElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);

	// Position menu relative to trigger button
	useEffect(() => {
		if (!open || !menuRef.current || !wrapRef.current) return;
		const trigger = wrapRef.current.querySelector(triggerSelector);
		if (!trigger) return;
		const rect = trigger.getBoundingClientRect();
		menuRef.current.style.left = rect.left + 'px';
		menuRef.current.style.top = (rect.bottom + offsetTop) + 'px';
	}, [open, triggerSelector, offsetTop]);

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

	const toggle = useCallback(() => setOpen(o => !o), []);
	const close = useCallback(() => setOpen(false), []);

	return { open, setOpen, toggle, close, wrapRef, menuRef };
}
