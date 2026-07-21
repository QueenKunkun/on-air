// Minimal vscode module mock for testing outside VS Code
module.exports = {
  workspace: {
    getWorkspaceFolder() { return null; },
    workspaceFolders: null,
  },
  Uri: {
    file(f) { return { fsPath: f, scheme: 'file', toString() { return 'file://' + f; } }; },
  },
  extensions: {
    getExtension() { return undefined; },
  },
  window: {},
  env: {},
  commands: {},
};
