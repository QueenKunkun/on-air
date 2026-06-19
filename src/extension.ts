import * as vscode from 'vscode';
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
			const id = server.registerDocument(uriKey, fileTitle(doc), doc.getText(), kind);
			const url = server.buildUrl(id);
			const choice = await vscode.window.showQuickPick(
				[
					{ label: '$(globe) Open in Browser', action: 'open' as const },
					{ label: '$(clippy) Copy Link to Clipboard', action: 'copy' as const },
				],
				{ placeHolder: url, title: 'OnAir · Choose an Action' }
			);
			if (!choice) { return; }

			if (choice.action === 'open') {
				await vscode.env.openExternal(vscode.Uri.parse(url));
				vscode.window.setStatusBarMessage(`OnAir: Opened in browser - ${url}`, 4000);
			} else {
				await vscode.env.clipboard.writeText(url);
				vscode.window.setStatusBarMessage(`OnAir: Link copied - ${url}`, 4000);
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
				server?.updateDocument(uriKey, fileTitle(e.document), e.document.getText(), kind);
			}, 200);
			debounceTimers.set(uriKey, timer);
		}),

		vscode.workspace.onDidCloseTextDocument((doc) => {
			if (!docKind(doc.languageId)) { return; }
			server?.closeDocument(doc.uri.toString());
		})
	);
}

export function deactivate() {
	server?.stop();
	for (const t of debounceTimers.values()) { clearTimeout(t); }
	debounceTimers.clear();
}
