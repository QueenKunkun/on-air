import type { WebSocket } from 'ws';

export type DocKind = 'markdown' | 'html' | 'image';

export type CiteStyle = 'link' | 'footnotes';

export interface DocEntry {
	id: string;
	title: string;
	fullPath: string;
	kind: DocKind;
	page: string;
	bodyHtml?: string;
	rootDir: string;
	content?: string;
	citeStyle?: CiteStyle;
	clients: Set<WebSocket>;
}
