import type { WebSocket } from 'ws';

export type DocKind = 'markdown' | 'html' | 'image';

export interface DocEntry {
	id: string;
	title: string;
	fullPath: string;
	kind: DocKind;
	page: string;
	bodyHtml?: string;
	rootDir: string;
	clients: Set<WebSocket>;
}
