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
	// Use raw URL matching (not URL normalization) to preserve ".." segments.
	// new URL() collapses /preview/ID/../x to /preview/x, breaking the ID capture.
	const rawUrl = req.url || '';
	const staticMatch = rawUrl.match(/^\/preview\/([a-f0-9]+)\/(.+)$/);
	if (!staticMatch) return;

	const entry = docs.get(staticMatch[1]);
	if (!entry) {
		res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
		res.end('Preview not found or has been closed. Please regenerate the link in VS Code.');
		return;
	}
	const rel = staticMatch[2];
	// Resolve relative to the referencing document's own directory first (browser
	// semantics for iframe/embed/img siblings), then fall back to the workspace root
	// for backward compatibility.
	const filePath = resolveStaticPath(entry.rootDir, rel, path.dirname(entry.fullPath))
		?? resolveStaticPath(entry.rootDir, rel);
	if (!filePath) {
		res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
		res.end('File not found');
		return;
	}

	// Document files (markdown/HTML/images) redirect to rendered preview,
	// UNLESS the request is from an embedded resource (iframe/sub-resource).
	// Embedded requests have Referer pointing to /preview/ but Accept
	// does not include text/html; direct navigation always includes text/html.
		const kind = kindFromPath(filePath);
	if (kind) {
		const referer = (req.headers.referer as string) || '';
		const accept = (req.headers.accept as string) || '';
		const secFetchDest = (req.headers['sec-fetch-dest'] as string) || '';
		// A request is an embedded sub-resource (served raw, no preview chrome) when:
		//  - it comes from an iframe/embed — Sec-Fetch-Dest reliably reports 'iframe'/'embed',
		//  - or (legacy clients) Referer points to /preview/ and Accept lacks text/html.
		// Note: an <iframe> loading an HTML document DOES send `Accept: text/html`, so the
		// Sec-Fetch-Dest check is required — otherwise HTML embeds get wrapped in preview chrome.
		const isEmbedded = secFetchDest === 'iframe' || secFetchDest === 'embed'
			|| (referer.includes('/preview/') && !accept.includes('text/html'));

		if (isEmbedded) {
			// Serve raw file for embedded requests (e.g. iframe in preview)
			fs.readFile(filePath, (err, data) => {
				if (err) {
					res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
					res.end('File not found');
					return;
				}
				res.writeHead(200, { 'Content-Type': mimeType(filePath) });
				res.end(data);
			});
			return;
		}

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
