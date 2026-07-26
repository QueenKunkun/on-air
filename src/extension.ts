import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { PreviewServer, DocKind } from './server';
import { debug, setDebugEnabled } from './common/debug';
import { DEFAULT_PORT } from './common/constants';
import { IMAGE_EXTS } from './common/extensions';

let server: PreviewServer | undefined;
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

function fileTitle(doc: vscode.TextDocument): string {
	return doc.fileName.split(/[\\/]/).pop() || 'Untitled';
}

const IMAGE_EXT_SET = new Set<string>(IMAGE_EXTS);

function docKind(doc: vscode.TextDocument): DocKind | null {
	if (doc.languageId === 'markdown') { return 'markdown'; }
	if (doc.languageId === 'html') { return 'html'; }
	const ext = path.extname(doc.fileName).toLowerCase();
	if (IMAGE_EXT_SET.has(ext)) { return 'image'; }
	return null;
}

export async function activate(context: vscode.ExtensionContext) {
	setDebugEnabled(!!process.env.ONAIR_DEBUG);
	server = new PreviewServer();
		try {
			await server.start(DEFAULT_PORT);
			console.log('[on-air] server started on port', server.port);
		} catch (err) {
		vscode.window.showErrorMessage('OnAir: Failed to start local server - ' + (err as Error).message);
	}

	context.subscriptions.push(
		vscode.commands.registerCommand('onAir.generateUrl', async () => {
			const editor = vscode.window.activeTextEditor;
			const kind = editor ? docKind(editor.document) : null;
			if (!editor || !kind) {
				vscode.window.showWarningMessage('Please open a Markdown, HTML, or image file first to generate a preview link');
				return;
			}
			if (!server) { return; }

		const doc = editor.document;
		const uriKey = doc.uri.toString();
		console.log('[on-air] generateUrl: uriKey=', uriKey);
		const rawWsFolder = vscode.workspace.getWorkspaceFolder(doc.uri);
		debug(`rawWsFolder=${JSON.stringify(rawWsFolder, null, 2)}`);
		const wsFolder = doc.uri.scheme === 'file' ? vscode.workspace.getWorkspaceFolder(doc.uri) : undefined;
		const rootDir = wsFolder ? wsFolder.uri.fsPath : '';
		debug(`generateUrl: scheme=${doc.uri.scheme} rootDir=${rootDir || '(none)'} file=${doc.fileName}`);
		const content = kind === 'image' ? doc.fileName : doc.getText();
		const id = server.registerDocument(uriKey, fileTitle(doc), content, kind, rootDir, doc.fileName);
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
			const kind = docKind(e.document);
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
			if (!docKind(doc)) { return; }
			server?.closeDocument(doc.uri.toString());
		}),

		// File system events — refresh file tree in all open preview tabs
		vscode.workspace.onDidCreateFiles(() => server?.broadcastFileTreeChange([])),
		vscode.workspace.onDidDeleteFiles(() => server?.broadcastFileTreeChange([])),
		vscode.workspace.onDidRenameFiles(() => server?.broadcastFileTreeChange([]))
	);

	// Internal debug only: dump the current preview HTML next to the source file.
	const EXPORT_MARKER = '<!-- onair:export:md -->';
	context.subscriptions.push(
		vscode.commands.registerCommand('onAir.exportPreviewHtml', async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || docKind(editor.document) !== 'markdown') {
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
