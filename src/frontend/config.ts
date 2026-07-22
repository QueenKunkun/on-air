export interface OnAirConfig {
	id: string;
	fullPath: string;
	relPath: string;
	rootDir: string;
	themes: { id: string; label: string }[] | null;
	version: string;
}

declare global {
	interface Window {
		__ONAIR__: OnAirConfig;
	}
}
