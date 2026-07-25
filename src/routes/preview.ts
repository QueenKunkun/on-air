import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { kindFromPath } from './utils';
import type { DocEntry } from './types';

export function handlePreview(
	req: { url: string },
	res: { writeHead(code: number, headers?: Record<string, string>): void; end(body?: string | Buffer): void },
	docs: Map<string, DocEntry>,
	registerDocument: (uriKey: string, title: string, content: string, kind: string, rootDir: string, fullPath: string) => string,
): void {
	const u = new URL(req.url || '', 'http://localhost');
	const pathname = u.pathname;
	const sp = u.searchParams;
	const match = pathname.match(/^\/preview\/([a-f0-9]+)\/?$/);
	if (!match) return;

	const entry = docs.get(match[1]);
	if (!entry) {
		// Lazy registration: an xref link may point at a file that was
		// found on disk but never opened as a preview.
		const file = sp.get('file');
		const kind = file ? kindFromPath(file) : null;
		if (file && kind && fs.existsSync(file)) {
			const data = fs.readFileSync(file, 'utf8');
			const ws = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(file));
			const rootDir = ws ? ws.uri.fsPath : path.dirname(file);
			const newId = registerDocument(vscode.Uri.file(file).toString(), path.basename(file), data, kind, rootDir, file);
			const newEntry = docs.get(newId);
			if (newEntry) {
				res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
				res.end(newEntry.page);
				return;
			}
		}
		res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
		res.end('Preview not found or has been closed. Please regenerate the link in VS Code.');
		return;
	}
	res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
	res.end(entry.page);
}
