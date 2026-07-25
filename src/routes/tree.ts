import * as fs from 'fs';
import * as path from 'path';
import ignore from 'ignore';
import { debugWarn } from '../common/debug';
import { SUPPORTED_EXTS, IMAGE_EXTS } from '../common/extensions';
import { isDangerousRootDir, toPosix, shouldSkipDir, isHidden, isSupportedExt, isImageExt, isBinaryFile } from './utils';
import type { DocEntry } from './types';

export function handleTree(
	req: { url: string },
	res: { writeHead(code: number, headers?: Record<string, string>): void; end(body?: string | Buffer): void },
	docs: Map<string, DocEntry>,
): void {
	const u = new URL(req.url || '', 'http://localhost');
	const sp = u.searchParams;
	const id = sp.get('id') || '';
	const dir = sp.get('dir') || '';
	const respectGitignore = sp.get('respectGitignore') === '1';
	const extFilter = sp.get('ext') || '';
	const hideBinary = sp.get('hideBinary') === '1';

	const entry = docs.get(id);
	if (!entry) {
		res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
		res.end(JSON.stringify({ error: 'Preview not found' }));
		return;
	}

	const rootDirResolved = path.resolve(entry.rootDir);
	if (isDangerousRootDir(entry.rootDir)) {
		debugWarn('/api/tree: rootDir empty or unsafe, returning empty tree.', `file=${entry.fullPath} rootDir=${JSON.stringify(entry.rootDir)}`);
		res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
		res.end(JSON.stringify({ dir: '', entries: [] }));
		return;
	}
	const targetDir = dir ? path.resolve(rootDirResolved, dir) : rootDirResolved;
	if (dir && !targetDir.startsWith(rootDirResolved + path.sep)) {
		res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
		res.end(JSON.stringify({ error: 'Directory outside root' }));
		return;
	}

	let dirents: fs.Dirent[];
	try { dirents = fs.readdirSync(targetDir, { withFileTypes: true }); }
	catch {
		res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
		res.end(JSON.stringify({ error: 'Cannot read directory' }));
		return;
	}

	// Load root .gitignore
	let ig: ReturnType<typeof ignore> | null = null;
	if (respectGitignore) {
		try {
			const giPath = path.join(rootDirResolved, '.gitignore');
			ig = ignore().add(fs.readFileSync(giPath, 'utf8'));
		} catch { /* no .gitignore — skip */ }
	}

	const result: Array<{ name: string; type: string; path: string; ext: string; size?: number }> = [];
	for (const e of dirents) {
		if (isHidden(e.name)) { continue; }
		const full = path.join(targetDir, e.name);
		const relPath = toPosix(path.relative(rootDirResolved, full));

		if (e.isDirectory()) {
			if (shouldSkipDir(e.name)) { continue; }
			if (ig && ig.ignores(relPath + '/')) { continue; }
			// Check if directory has any visible children
			try {
				const subEntries = fs.readdirSync(full, { withFileTypes: true });
				const hasVisible = subEntries.some(se => {
					if (isHidden(se.name)) return false;
					if (se.isDirectory()) {
						if (shouldSkipDir(se.name)) return false;
						if (ig && ig.ignores(relPath + '/' + se.name + '/')) return false;
						return true;
					}
					if (!se.isFile()) return false;
					const ext = path.extname(se.name).toLowerCase();
					if (extFilter && !extFilter.split(',').includes(ext)) return false;
					if (ig && ig.ignores(relPath + '/' + se.name)) return false;
					if (hideBinary) {
						if (!isSupportedExt(ext)) return false;
						if (!isImageExt(ext) && isBinaryFile(path.join(full, se.name))) return false;
					}
					return true;
				});
				if (!hasVisible) continue;
			} catch { continue; }
			result.push({ name: e.name, type: 'directory', path: relPath, ext: '' });
		} else if (e.isFile()) {
			const ext = path.extname(e.name).toLowerCase();
			if (extFilter && !extFilter.split(',').includes(ext)) { continue; }
			if (ig && ig.ignores(relPath)) { continue; }
			if (hideBinary) {
				if (!isSupportedExt(ext)) { continue; }
				if (!isImageExt(ext) && isBinaryFile(full)) { continue; }
			}
			result.push({ name: e.name, type: 'file', path: relPath, ext, size: fs.statSync(full).size });
		}
	}

	res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
	res.end(JSON.stringify({ dir: toPosix(path.relative(rootDirResolved, targetDir) || ''), entries: result }));
}
