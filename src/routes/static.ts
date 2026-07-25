import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { resolveStaticPath, kindFromPath, mimeType } from './utils';
import type { DocEntry } from './types';

export function handleStatic(
	req: { url: string; headers: Record<string, string | string[] | undefined> },
	res: { writeHead(code: number, headers?: Record<string, string>): void; end(body?: string | Buffer): void },
	docs: Map<string, DocEntry>,
	uriToId: Map<string, string>,
	registerDocument: (uriKey: string, title: string, content: string, kind: string, rootDir: string, fullPath: string) => string,
): void {
	const u = new URL(req.url || '', 'http://localhost');
	const pathname = u.pathname;
	const staticMatch = pathname.match(/^\/preview\/([a-f0-9]+)\/(.+)$/);
	if (!staticMatch) return;

	const entry = docs.get(staticMatch[1]);
	if (!entry) {
		res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
		res.end('Preview not found or has been closed. Please regenerate the link in VS Code.');
		return;
	}
	const rel = staticMatch[2];
	const filePath = resolveStaticPath(entry.rootDir, rel);
	if (!filePath) {
		res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
		res.end('File not found');
		return;
	}

	// If the request has a Referer pointing to a preview page (e.g. an <iframe>
	// inside the preview), serve the raw file directly instead of redirecting
	const referer = (req.headers.referer as string) || '';
	const isEmbedded = referer.includes('/preview/');

	if (!isEmbedded) {
		const kind = kindFromPath(filePath);
		if (kind) {
			const frag = rel.includes('#') ? '#' + rel.split('#')[1] : '';
			const uriKey = vscode.Uri.file(filePath).toString();
			const existingId = uriToId.get(uriKey);
			if (existingId) {
				res.writeHead(302, { Location: `/preview/${existingId}${frag}` });
				res.end();
				return;
			}
			fs.readFile(filePath, 'utf8', (err, data) => {
				if (err) {
					res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
					res.end('File not found');
					return;
				}
				const targetWs = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
				const targetRootDir = targetWs ? targetWs.uri.fsPath : path.dirname(filePath);
				const newId = registerDocument(uriKey, path.basename(filePath), data, kind, targetRootDir, filePath);
				res.writeHead(302, { Location: `/preview/${newId}${frag}` });
				res.end();
			});
			return;
		}
	}

	fs.readFile(filePath, (err, data) => {
		if (err) {
			res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
			res.end('File not found');
			return;
		}
		res.writeHead(200, { 'Content-Type': mimeType(filePath) });
		res.end(data);
	});
}
