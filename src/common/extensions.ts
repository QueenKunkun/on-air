/** All markdown file extensions (lowercase, with dot) */
export const MARKDOWN_EXTS = ['.md', '.markdown', '.mdx'] as const;

/** HTML file extensions */
export const HTML_EXTS = ['.html', '.htm'] as const;

/** All document extensions (markdown + HTML) */
export const DOCUMENT_EXTS = [...MARKDOWN_EXTS, ...HTML_EXTS] as const;

/** Extensions supported by the file tree (when "hide binary" is on) */
export const SUPPORTED_EXTS = [
	...DOCUMENT_EXTS,
	'.txt', '.log', '.json', '.js', '.css',
	'.ts', '.tsx', '.jsx', '.svg',
	'.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp', '.ico',
	'.pdf',
] as const;

/** Image extensions (never null-byte filtered) */
export const IMAGE_EXTS = [
	'.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp', '.ico',
] as const;

/** Code file extensions (rendered as syntax-highlighted text) */
export const CODE_EXTS = ['.json', '.js', '.ts', '.tsx', '.jsx', '.css', '.txt', '.log'] as const;

/** PDF extensions */
export const PDF_EXTS = ['.pdf'] as const;

/** Common binary file extensions (fast path for isBinaryFile) */
export const BINARY_EXTS = [
	// Archives
	'.zip', '.tar', '.gz', '.bz2', '.7z', '.rar', '.xz',
	// Executables
	'.exe', '.dll', '.so', '.dylib', '.app', '.bin',
	// Media
	'.mp3', '.mp4', '.wav', '.avi', '.mov', '.mkv', '.flac', '.ogg', '.webm',
	'.woff', '.woff2', '.ttf', '.otf', '.eot',
	// Documents
	'.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.odp',
	// Other
	'.class', '.jar', '.war', '.ear', '.swf', '.iso', '.dmg', '.pkg',
] as const;

/** Check if extension is a markdown type */
export function isMarkdownExt(ext: string): boolean {
	return (MARKDOWN_EXTS as readonly string[]).includes(ext);
}

/** Check if extension is any document type */
export function isDocumentExt(ext: string): boolean {
	return (DOCUMENT_EXTS as readonly string[]).includes(ext);
}

/** Check if extension is a PDF */
export function isPdfExt(ext: string): boolean {
	return (PDF_EXTS as readonly string[]).includes(ext);
}

/** Check if extension is a code file */
export function isCodeExt(ext: string): boolean {
	return (CODE_EXTS as readonly string[]).includes(ext);
}

/** Get markdown ext filter string for /api/query (comma-separated) */
export function markdownExtFilter(): string {
	return MARKDOWN_EXTS.join(',');
}
