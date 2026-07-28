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
 */
export function resolveStaticPath(rootDir: string, relPath: string): string | null {
	const decoded = decodeURIComponent(relPath.split('?')[0].split('#')[0]);
	const resolvedRoot = path.resolve(rootDir);
	const resolvedTarget = path.resolve(resolvedRoot, decoded);
	const isInsideRoot = resolvedTarget === resolvedRoot || resolvedTarget.startsWith(resolvedRoot + path.sep);
	if (!isInsideRoot) { return null; }
	try {
		if (fs.statSync(resolvedTarget).isFile()) { return resolvedTarget; }
	} catch {
		// File doesn't exist or isn't accessible
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
