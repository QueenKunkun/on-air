import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { PreviewServer, DocKind } from './server';

let server: PreviewServer | undefined;
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

function fileTitle(doc: vscode.TextDocument): string {
	return doc.fileName.split(/[\\/]/).pop() || 'Untitled';
}

function docKind(languageId: string): DocKind | null {
	if (languageId === 'markdown') { return 'markdown'; }
	if (languageId === 'html') { return 'html'; }
	return null;
}

export async function activate(context: vscode.ExtensionContext) {
	server = new PreviewServer();
	try {
		await server.start(5757);
	} catch (err) {
		vscode.window.showErrorMessage('OnAir: Failed to start local server - ' + (err as Error).message);
	}

	context.subscriptions.push(
		vscode.commands.registerCommand('onAir.generateUrl', async () => {
			const editor = vscode.window.activeTextEditor;
			const kind = editor ? docKind(editor.document.languageId) : null;
			if (!editor || !kind) {
				vscode.window.showWarningMessage('Please open a Markdown or HTML file first to generate a preview link');
				return;
			}
			if (!server) { return; }

		const doc = editor.document;
		const uriKey = doc.uri.toString();
		// Files alongside the source document (images/, embeds/, attachments/, etc.) are
		// only resolvable on disk, so this only works for real files (not untitled buffers).
		// When the file lives inside a workspace folder, resolve relative links against the
		// whole folder root (so `../` links within the project work); otherwise scope to the
		// file's own directory.
		const wsFolder = doc.uri.scheme === 'file' ? vscode.workspace.getWorkspaceFolder(doc.uri) : undefined;
		const rootDir = wsFolder ? wsFolder.uri.fsPath : (doc.uri.scheme === 'file' ? path.dirname(doc.uri.fsPath) : '');
		const id = server.registerDocument(uriKey, fileTitle(doc), doc.getText(), kind, rootDir, doc.fileName);
			const url = server.buildUrl(id);
			const lanIp = server.getLanIp();
			const lanUrl = lanIp ? `http://${lanIp}:${server.port}/preview/${id}` : null;

			type PickItem = vscode.QuickPickItem & { action: string; targetUrl: string };
			const items: PickItem[] = [
				{ label: '$(globe) Open in Browser', detail: url, action: 'open', targetUrl: url },
				{ label: '$(clippy) Copy Link', detail: url, action: 'copy', targetUrl: url },
			];
			if (lanUrl) {
				items.push(
					{ label: '', detail: '', action: '', targetUrl: '' },
					{ label: '$(globe) Open in Browser (LAN)', detail: lanUrl, action: 'open', targetUrl: lanUrl },
					{ label: '$(clippy) Copy Link (LAN)', detail: lanUrl, action: 'copy', targetUrl: lanUrl },
				);
			}
			const choice = await vscode.window.showQuickPick(items, {
				placeHolder: url,
				title: 'OnAir · Choose an Action',
			});
			if (!choice || !choice.action) { return; }

			if (choice.action === 'open') {
				await vscode.env.openExternal(vscode.Uri.parse(choice.targetUrl));
				vscode.window.setStatusBarMessage(`OnAir: Opened in browser - ${choice.targetUrl}`, 4000);
			} else {
				await vscode.env.clipboard.writeText(choice.targetUrl);
				vscode.window.setStatusBarMessage(`OnAir: Link copied - ${choice.targetUrl}`, 4000);
			}
		}),

		vscode.workspace.onDidChangeTextDocument((e) => {
			const kind = docKind(e.document.languageId);
			if (!kind) { return; }
			const uriKey = e.document.uri.toString();
			const existing = debounceTimers.get(uriKey);
			if (existing) { clearTimeout(existing); }
			const timer = setTimeout(() => {
				debounceTimers.delete(uriKey);
				server?.updateDocument(uriKey, fileTitle(e.document), e.document.getText(), kind, e.document.fileName);
			}, 200);
			debounceTimers.set(uriKey, timer);
		}),

		vscode.workspace.onDidCloseTextDocument((doc) => {
			if (!docKind(doc.languageId)) { return; }
			server?.closeDocument(doc.uri.toString());
		})
	);

	// Internal debug only: dump the current preview HTML next to the source file.
	const EXPORT_MARKER = '<!-- onair:export:md -->';
	context.subscriptions.push(
		vscode.commands.registerCommand('onAir.exportPreviewHtml', async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || docKind(editor.document.languageId) !== 'markdown') {
				vscode.window.showWarningMessage('Open a Markdown file first to export its preview HTML');
				return;
			}
			const doc = editor.document;
			const html = server?.renderHtmlForUri(doc.uri.toString());
			if (html === undefined || html === null) {
				vscode.window.showWarningMessage('Generate an OnAir preview link for this file first');
				return;
			}
			const dir = path.dirname(doc.uri.fsPath);
			const base = path.basename(doc.uri.fsPath, path.extname(doc.uri.fsPath));
			const resolveOut = (suffix: string) => path.join(dir, `${base}${suffix}.md.html`);

			let outPath = resolveOut('');
			if (fs.existsSync(outPath)) {
				const head = fs.readFileSync(outPath, 'utf8').slice(0, EXPORT_MARKER.length);
				if (head !== EXPORT_MARKER) {
					let n = 1;
					do { outPath = resolveOut(` (${n++})`); } while (fs.existsSync(outPath));
				}
			}
			fs.writeFileSync(outPath, html);
			vscode.window.setStatusBarMessage(`OnAir: Exported preview → ${outPath}`, 5000);
		})
	);
}

export function deactivate() {
	server?.stop();
	for (const t of debounceTimers.values()) { clearTimeout(t); }
	debounceTimers.clear();
}
