import * as fs from 'fs';
import * as path from 'path';
import ignore from 'ignore';
import { debugWarn } from '../common/debug';
import { isDangerousRootDir, toPosix, shouldSkipDir, isHidden, isSupportedExt, isImageExt, isBinaryFile } from './utils';
import type { DocEntry } from './types';

export function handleFileIndex(
	req: { url: string },
	res: { writeHead(code: number, headers?: Record<string, string>): void; end(body?: string | Buffer): void },
	docs: Map<string, DocEntry>,
): void {
	const u = new URL(req.url || '', 'http://localhost');
	const sp = u.searchParams;
	const id = sp.get('id') || '';
	const entry = docs.get(id);
	if (!entry) {
		res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
		res.end(JSON.stringify({ error: 'Preview not found' }));
		return;
	}

	const rootDirResolved = path.resolve(entry.rootDir);
	if (isDangerousRootDir(entry.rootDir)) {
		debugWarn('/api/file-index: rootDir empty or unsafe, returning empty index.', `file=${entry.fullPath} rootDir=${JSON.stringify(entry.rootDir)}`);
		res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
		res.end(JSON.stringify({ entries: [] }));
		return;
	}
	const index: Array<{ name: string; type: string; path: string; ext: string; size: number }> = [];

	const ig: ReturnType<typeof ignore> | null = (() => {
		try {
			return ignore().add(fs.readFileSync(path.join(rootDirResolved, '.gitignore'), 'utf8'));
		} catch { return null; }
	})();

	const MAX_WALK_DEPTH = 15;
	const MAX_INDEX_ENTRIES = 5000;

	const walk = (dir: string, depth: number = 0) => {
		if (depth > MAX_WALK_DEPTH || index.length >= MAX_INDEX_ENTRIES) return;
		let dirents: fs.Dirent[];
		try { dirents = fs.readdirSync(dir, { withFileTypes: true }); }
		catch { return; }

		for (const e of dirents) {
			if (isHidden(e.name)) continue;
			if (e.isDirectory()) {
				if (shouldSkipDir(e.name)) continue;
				const rel = toPosix(path.relative(rootDirResolved, path.join(dir, e.name)));
				if (ig && ig.ignores(rel + '/')) continue;
				index.push({ name: e.name, type: 'directory', path: rel, ext: '', size: 0 });
				walk(path.join(dir, e.name), depth + 1);
			} else if (e.isFile()) {
				const ext = path.extname(e.name).toLowerCase();
				const full = path.join(dir, e.name);
				const rel = toPosix(path.relative(rootDirResolved, full));
				if (ig && ig.ignores(rel)) continue;
				if (!isSupportedExt(ext)) continue;
				if (!isImageExt(ext) && isBinaryFile(full)) continue;
				try {
					const stat = fs.statSync(full);
					index.push({ name: e.name, type: 'file', path: rel, ext, size: stat.size });
				} catch { /* skip */ }
			}
		}
	};

	walk(rootDirResolved);

	res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
	res.end(JSON.stringify({ entries: index }));
}
