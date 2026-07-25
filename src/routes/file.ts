import * as fs from 'fs';
import * as path from 'path';
import { resolveStaticPath } from './utils';
import type { DocEntry } from './types';

export function handleFile(
	req: { url: string },
	res: { writeHead(code: number, headers?: Record<string, string>): void; end(body?: string | Buffer): void },
	docs: Map<string, DocEntry>,
): void {
	const u = new URL(req.url || '', 'http://localhost');
	const sp = u.searchParams;
	const id = sp.get('id') || '';
	const filePath = sp.get('path') || '';

	const entry = docs.get(id);
	if (!entry) {
		res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
		res.end(JSON.stringify({ error: 'Preview not found' }));
		return;
	}

	const absPath = resolveStaticPath(entry.rootDir, filePath);
	if (!absPath) {
		res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
		res.end(JSON.stringify({ error: 'File not found' }));
		return;
	}

	try {
		const buf = fs.readFileSync(absPath);
		const isBinary = buf.includes(0);
		const content = isBinary ? null : buf.toString('utf8');
		res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
		res.end(JSON.stringify({ content, ext: path.extname(absPath).toLowerCase(), size: buf.length, isBinary }));
	} catch {
		res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
		res.end(JSON.stringify({ error: 'Cannot read file' }));
	}
}
