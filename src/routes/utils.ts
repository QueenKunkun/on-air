import * as fs from 'fs';
import * as path from 'path';
import { MARKDOWN_EXTS, SUPPORTED_EXTS, IMAGE_EXTS, BINARY_EXTS, isMarkdownExt } from '../common/extensions';

export const toPosix = (p: string): string => (path.sep !== '/' ? p.split(path.sep).join('/') : p);

export type DocKind = 'markdown' | 'html' | 'image';

const IMAGE_EXT_SET = new Set<string>(IMAGE_EXTS);
const BINARY_EXT_SET = new Set<string>(BINARY_EXTS);

export function kindFromPath(p: string): DocKind | null {
	const ext = path.extname(p).toLowerCase();
	if (isMarkdownExt(ext)) { return 'markdown'; }
	if (ext === '.html' || ext === '.htm') { return 'html'; }
	if (IMAGE_EXT_SET.has(ext)) { return 'image'; }
	return null;
}

/**
 * Resolve a relative request path against a document's root directory, guarding
 * against path traversal. Returns the absolute file path if it's a real file
 * inside rootDir, or null otherwise.
 *
 * `baseDir` overrides the resolution base for the relative path (defaults to
 * rootDir). This is used to resolve sub-resources (iframe/embed/img) relative to
 * the referencing document's own directory rather than the workspace root, which
 * matches browser semantics — e.g. an `<iframe src="embeds/x.html">` next to the
 * markdown file resolves to `<docDir>/embeds/x.html>` even when the file lives in
 * a subfolder of the workspace.
 */
export function resolveStaticPath(rootDir: string, relPath: string, baseDir?: string): string | null {
	const decoded = decodeURIComponent(relPath.split('?')[0].split('#')[0]);
	// A sub-resource (iframe/embed/img) is referenced relative to the document that
	// embeds it, so it may legitimately live inside the document's own directory
	// (`baseDir`/`docDir`) — even when the document is opened outside any workspace
	// or in a different project than `rootDir`. Allow the resolved target to sit
	// inside either the document directory or the workspace root, but nowhere else
	// (this still blocks path traversal).
	const base = path.resolve(baseDir ?? rootDir ?? process.cwd());
	const resolvedRoot = rootDir ? path.resolve(rootDir) : null;
	const resolvedTarget = path.resolve(base, decoded);
	// Check: target inside base (docDir) or root (workspace)?
	const allowedRoots = [base, resolvedRoot].filter((r): r is string => !!r);
	if (allowedRoots.some((r) => resolvedTarget === r || resolvedTarget.startsWith(r + path.sep))) {
		try {
			if (fs.statSync(resolvedTarget).isFile()) { return resolvedTarget; }
		} catch { /* file doesn't exist */ }
		return null;
	}
	// Fallback: walk up from baseDir to find the nearest common ancestor.
	// This handles the case where a single file is opened outside any workspace
	// and references a sibling directory (e.g. ../public/icon/foo.svg from store/).
	const MAX_WALK = 5;
	let cur = base;
	for (let i = 0; i < MAX_WALK; i++) {
		const parent = path.dirname(cur);
		if (parent === cur) break; // filesystem root
		cur = parent;
		if (resolvedTarget.startsWith(cur + path.sep) || resolvedTarget === cur) {
			try {
				if (fs.statSync(resolvedTarget).isFile()) { return resolvedTarget; }
			} catch { /* file doesn't exist */ }
			return null;
		}
	}
	return null;
}

export function isDangerousRootDir(rootDir: string): boolean {
	if (!rootDir) return true;
	const resolved = path.resolve(rootDir);
	if (resolved === '/' || resolved === process.cwd()) return true;
	const dangerous = ['/', '/Users', '/home', '/root', '/var', '/etc', '/usr', '/opt', '/tmp'];
	const dangerousWin = ['C:\\', 'D:\\'];
	for (const d of dangerous) {
		if (resolved === d || resolved === d + path.sep) return true;
	}
	for (const d of dangerousWin) {
		if (resolved === d || resolved === d + path.sep) return true;
	}
	const home = process.env.HOME || process.env.USERPROFILE;
	if (home && (resolved === home || resolved === home + path.sep)) return true;
	return false;
}

const MIME_TYPES: Record<string, string> = {
	...Object.fromEntries(MARKDOWN_EXTS.map(e => [e, 'text/markdown; charset=utf-8'])),
	'.html': 'text/html; charset=utf-8',
	'.htm': 'text/html; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.txt': 'text/plain; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.avif': 'image/avif',
	'.bmp': 'image/bmp',
	'.ico': 'image/x-icon',
	'.pdf': 'application/pdf',
	'.zip': 'application/zip',
	'.mp4': 'video/mp4',
	'.webm': 'video/webm',
	'.mp3': 'audio/mpeg',
	'.wav': 'audio/wav',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.ttf': 'font/ttf',
};

export function mimeType(filePath: string): string {
	return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

/** Check if a Dirent is a hidden/skip directory */
export function shouldSkipDir(name: string): boolean {
	return name === 'node_modules' || name === '.git' || name === '.vscode';
}

/** Check if a file should be hidden (dotfile) */
export function isHidden(name: string): boolean {
	return name.startsWith('.');
}

/** Check if a file is binary by extension first, then by reading first 512 bytes */
export function isBinaryFile(filePath: string): boolean {
	// Fast path: check extension against known binary types
	const ext = path.extname(filePath).toLowerCase();
	if (BINARY_EXT_SET.has(ext)) {
		return true;
	}
	// If extension is in supported text list, assume it's text
	if (SUPPORTED_EXTS.includes(ext as any)) {
		return false;
	}
	// Fallback: read first 512 bytes to check for null bytes
	try {
		const fd = fs.openSync(filePath, 'r');
		const buf = Buffer.alloc(512);
		const bytesRead = fs.readSync(fd, buf, 0, 512, 0);
		fs.closeSync(fd);
		return buf.subarray(0, bytesRead).includes(0);
	} catch {
		return true;
	}
}

/** Check if a file extension is supported for the file tree */
export function isSupportedExt(ext: string): boolean {
	return (SUPPORTED_EXTS as readonly string[]).includes(ext);
}

/** Check if a file extension is an image */
export function isImageExt(ext: string): boolean {
	return (IMAGE_EXTS as readonly string[]).includes(ext);
}
