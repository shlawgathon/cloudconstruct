import * as vscode from 'vscode';
import { FileSystemProvider } from './FileSystemProvider';

/**
 * File operations commands
 * Handles file system commands for the extension
 */
export class FileSystemCommands {
    constructor(private readonly fileSystemProvider: FileSystemProvider) {}

    registerCommands(context: vscode.ExtensionContext): void {
        // TODO: Register file system commands
        context.subscriptions.push(
            // Add command registrations here
        );
    }
}

