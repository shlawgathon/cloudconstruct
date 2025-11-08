import * as vscode from 'vscode';
import { ClientManager } from './clientManager';

let clientManager: ClientManager | null = null;

export function activate(context: vscode.ExtensionContext) {
  clientManager = new ClientManager(context);

  const output = clientManager.getOutput();
  output.appendLine('CloudConstruct (v2) extension activated');

  const authenticate = vscode.commands.registerCommand('cloudconstruct-v2.authenticate', async () => {
    await clientManager!.authenticate();
  });

  const connect = vscode.commands.registerCommand('cloudconstruct-v2.connect', async () => {
    const ok = await clientManager!.connect();
    if (ok) {
      vscode.window.showInformationMessage('Connected to CloudConstruct worker.');
      clientManager!.getOutput().show(true);
    }
  });

  const disconnect = vscode.commands.registerCommand('cloudconstruct-v2.disconnect', async () => {
    await clientManager!.disconnect();
    vscode.window.showInformationMessage('Disconnected from CloudConstruct worker.');
  });

  const searchFiles = vscode.commands.registerCommand('cloudconstruct-v2.searchFiles', async () => {
    if (!clientManager!.isConnected()) {
      const go = await vscode.window.showWarningMessage('Not connected. Connect now?', 'Connect');
      if (go === 'Connect') {
        const ok = await clientManager!.connect();
        if (!ok) return;
      } else {
        return;
      }
    }

    const query = await vscode.window.showInputBox({ prompt: 'Search query (space = AND)', placeHolder: 'e.g. k8s deployment yaml' });
    if (!query) { return; }

    try {
      const results = await clientManager!.searchFilesLocally(query);
      if (!results.length) {
        vscode.window.showInformationMessage('No files matched your query.');
        return;
      }

      const picked = await vscode.window.showQuickPick(results, { placeHolder: 'Select a file path from worker index' });
      if (picked) {
        // Store last picked in context for the openFileFromSearch command
        context.workspaceState.update('cloudconstructV2.lastPickedPath', picked);
        clientManager!.log(`Picked file: ${picked}`);
        vscode.window.showInformationMessage(`Selected: ${picked}`);
      }
    } catch (e: any) {
      vscode.window.showErrorMessage(`Search failed: ${e?.message ?? e}`);
      clientManager!.log(`Search error: ${e?.stack ?? e}`);
    }
  });

  const openFileFromSearch = vscode.commands.registerCommand('cloudconstruct-v2.openFileFromSearch', async () => {
    const picked: string | undefined = await context.workspaceState.get('cloudconstructV2.lastPickedPath');
    if (!picked) {
      vscode.window.showWarningMessage('No previously selected path. Run "CloudConstruct: Search Files" first.');
      return;
    }
    // We don’t yet have a read response type from worker. For now, we open a virtual doc
    // with the selected path as read-only note, to be replaced once worker supports read responses.
    const doc = await vscode.workspace.openTextDocument({ content: `Worker path: ${picked}\n\nReading file content requires worker read response support.`, language: 'markdown' });
    await vscode.window.showTextDocument(doc, { preview: true });
  });

  const writeCurrentFile = vscode.commands.registerCommand('cloudconstruct-v2.writeCurrentFile', async () => {
    if (!clientManager!.isConnected()) {
      const go = await vscode.window.showWarningMessage('Not connected. Connect now?', 'Connect');
      if (go === 'Connect') {
        const ok = await clientManager!.connect();
        if (!ok) return;
      } else {
        return;
      }
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active editor.');
      return;
    }

    const defaultPath = editor.document.uri.fsPath.split(/[\\/]/).slice(-1)[0];
    const targetPath = await vscode.window.showInputBox({ prompt: 'Enter worker path to write to', value: defaultPath, ignoreFocusOut: true });
    if (!targetPath) { return; }

    try {
      await clientManager!.writeFile(targetPath, editor.document.getText());
      vscode.window.showInformationMessage(`Pushed current file to worker at ${targetPath}`);
    } catch (e: any) {
      vscode.window.showErrorMessage(`Write failed: ${e?.message ?? e}`);
      clientManager!.log(`Write error: ${e?.stack ?? e}`);
    }
  });

  context.subscriptions.push(authenticate, connect, disconnect, searchFiles, openFileFromSearch, writeCurrentFile);
}

export function deactivate() {
  clientManager?.disconnect();
}
