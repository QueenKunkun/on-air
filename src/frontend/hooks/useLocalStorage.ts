import { useCallback, useState } from 'preact/hooks';

function readStorage(key: string, initial: string): string {
	try { return localStorage.getItem(key) || initial; } catch { return initial; }
}

export function useLocalStorage(key: string, initial: string = ''): [string, (v: string) => void] {
	const [value, setValue] = useState(() => readStorage(key, initial));

	const setAndPersist = useCallback((v: string) => {
		setValue(v);
		try { localStorage.setItem(key, v); } catch { /* ignore */ }
	}, [key]);

	return [value, setAndPersist];
}
