import { useCallback, useEffect, useState } from 'preact/hooks';

function readStorage(key: string, initial: string): string {
	try { return localStorage.getItem(key) || initial; } catch { return initial; }
}

export function useLocalStorage(key: string, initial: string = ''): [string, (v: string) => void] {
	const [value, setValue] = useState(() => readStorage(key, initial));

	useEffect(() => {
		function onStorage(e: StorageEvent) {
			if (e.key === key) {
				setValue(e.newValue || initial);
			}
		}
		window.addEventListener('storage', onStorage);
		return () => window.removeEventListener('storage', onStorage);
	}, [key, initial]);

	const setAndPersist = useCallback((v: string) => {
		setValue(v);
		try { localStorage.setItem(key, v); } catch { /* ignore */ }
		// Also notify other tabs
		window.dispatchEvent(new StorageEvent('storage', { key, newValue: v }));
	}, [key]);

	return [value, setAndPersist];
}
