import * as vscode from 'vscode';
import { FileSystemProvider } from './FileSystemProvider';

/**
 * File operations commands
 * Handles file system commands for the extension
 */
export class FileSystemCommands {
    constructor(private readonly fileSystemProvider: FileSystemProvider) {}

    registerCommands(context: vscode.ExtensionContext): void {
        // Register command to create a new file
        context.subscriptions.push(
            vscode.commands.registerCommand('cloudconstruct.createFile', async (uri?: vscode.Uri) => {
                if (!uri) {
                    const fileName = await vscode.window.showInputBox({
                        prompt: 'Enter file name',
                        placeHolder: 'example.yaml'
                    });
                    if (fileName) {
                        uri = vscode.Uri.parse(`cloudconstruct:/${fileName}`);
                    } else {
                        return;
                    }
                }

                try {
                    const content = new TextEncoder().encode('');
                    await this.fileSystemProvider.writeFile(uri, content, { create: true, overwrite: false });
                    vscode.window.showInformationMessage(`File created: ${uri.path}`);
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to create file: ${error}`);
                }
            })
        );

        // Register command to delete a file
        context.subscriptions.push(
            vscode.commands.registerCommand('cloudconstruct.deleteFile', async (uri: vscode.Uri) => {
                if (!uri) {
                    vscode.window.showErrorMessage('No file selected');
                    return;
                }

                const confirm = await vscode.window.showWarningMessage(
                    `Are you sure you want to delete ${uri.path}?`,
                    { modal: true },
                    'Delete'
                );

                if (confirm === 'Delete') {
                    try {
                        await this.fileSystemProvider.delete(uri, { recursive: false });
                        vscode.window.showInformationMessage(`File deleted: ${uri.path}`);
                    } catch (error) {
                        vscode.window.showErrorMessage(`Failed to delete file: ${error}`);
                    }
                }
            })
        );

        // Register command to refresh file list
        context.subscriptions.push(
            vscode.commands.registerCommand('cloudconstruct.refreshFiles', async () => {
                try {
                    const uri = vscode.Uri.parse('cloudconstruct:/');
                    await this.fileSystemProvider.readDirectory(uri);
                    vscode.window.showInformationMessage('File list refreshed');
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to refresh files: ${error}`);
                }
            })
        );
    }
}

