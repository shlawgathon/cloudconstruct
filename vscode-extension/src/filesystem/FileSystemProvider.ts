import * as vscode from 'vscode';
import { EventEmitter, Event } from 'vscode';
import { VSCodeWorkerClient } from '../client/VSCodeWorkerClientWrapper';
import {
    WSMessage,
    FileListResponseMessage,
    FileOperationMessage,
    FileWriteRequestMessage
} from 'shared-api-client';

/**
 * VS Code file system provider
 * Provides custom file system operations via WebSocket
 */
export class FileSystemProvider implements vscode.FileSystemProvider {
    private _onDidChangeFile: EventEmitter<vscode.FileChangeEvent[]> = new EventEmitter<vscode.FileChangeEvent[]>();
    readonly onDidChangeFile: Event<vscode.FileChangeEvent[]> = this._onDidChangeFile.event;

    private fileCache: Map<string, { content: Uint8Array; mtime: number; type: vscode.FileType }> = new Map();
    private pendingOperations: Map<string, { resolve: (value: any) => void; reject: (error: Error) => void }> = new Map();
    private requestCounter = 0;

    constructor(private wsClient: VSCodeWorkerClient) {
        // Listen for file-related messages from WebSocket
        this.wsClient.onMessage((message: WSMessage) => {
            this.handleWebSocketMessage(message);
        });
    }

    private handleWebSocketMessage(message: WSMessage): void {
        switch (message.type) {
            case 'fileListResponse':
                this.handleFileListResponse(message as FileListResponseMessage);
                break;
            case 'fileOperation':
                // Handle file operation responses (read, create, update, delete)
                // This would need to be expanded based on actual worker responses
                break;
        }
    }

    private handleFileListResponse(message: FileListResponseMessage): void {
        const requestId = message.requestId || 'default';
        const handler = this.pendingOperations.get(`fileList:${requestId}`);
        if (handler) {
            handler.resolve(message.files);
            this.pendingOperations.delete(`fileList:${requestId}`);
        }
    }

    private generateRequestId(): string {
        return `req_${Date.now()}_${this.requestCounter++}`;
    }

    watch(_uri: vscode.Uri, _options: { recursive: boolean; excludes: string[] }): vscode.Disposable {
        // TODO: Implement file watching via WebSocket
        return new vscode.Disposable(() => {});
    }

    async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
        const path = uri.path;
        const cached = this.fileCache.get(path);
        
        if (cached) {
            return {
                type: cached.type,
                ctime: cached.mtime,
                mtime: cached.mtime,
                size: cached.content.length
            };
        }

        // Request file info via WebSocket
        // For now, assume it's a file if not in cache
        return {
            type: vscode.FileType.File,
            ctime: Date.now(),
            mtime: Date.now(),
            size: 0
        };
    }

    async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
        const path = uri.path || '/';
        const requestId = this.generateRequestId();

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingOperations.delete(`fileList:${requestId}`);
                reject(new Error('File list request timed out'));
            }, 10000); // 10 second timeout

            this.pendingOperations.set(`fileList:${requestId}`, {
                resolve: (files: string[]) => {
                    clearTimeout(timeout);
                    const entries: [string, vscode.FileType][] = files.map(file => [file, vscode.FileType.File]);
                    resolve(entries);
                },
                reject: (error: Error) => {
                    clearTimeout(timeout);
                    reject(error);
                }
            });

            // Request file list via WebSocket
            this.wsClient.requestFileList(requestId);
        });
    }

    createDirectory(uri: vscode.Uri): void | Thenable<void> {
        // Directories are created implicitly when files are created
        // This is a no-op for now
        return Promise.resolve();
    }

    async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        const path = uri.path;
        const cached = this.fileCache.get(path);

        if (cached) {
            return cached.content;
        }

        // Request file content via WebSocket
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('File read request timed out'));
            }, 10000);

            // Set up message handler for file content response
            const handler = (message: WSMessage) => {
                if (message.type === 'fileOperation' && (message as FileOperationMessage).operation === 'read') {
                    const fileMsg = message as FileOperationMessage;
                    if (fileMsg.path === path && fileMsg.content) {
                        clearTimeout(timeout);
                        this.wsClient.removeHandler(handler);
                        const content = new TextEncoder().encode(fileMsg.content);
                        this.fileCache.set(path, {
                            content,
                            mtime: Date.now(),
                            type: vscode.FileType.File
                        });
                        resolve(content);
                    }
                }
            };

            this.wsClient.onMessage(handler);
            this.wsClient.readFile(path);
        });
    }

    async writeFile(
        uri: vscode.Uri,
        content: Uint8Array,
        options: { create: boolean; overwrite: boolean }
    ): Promise<void> {
        const path = uri.path;
        const contentString = new TextDecoder().decode(content);

        if (!this.wsClient.getConnectionStatus()) {
            throw vscode.FileSystemError.Unavailable('WebSocket not connected');
        }

        // Use direct file write request
        this.wsClient.writeFile(path, contentString, options.overwrite);

        // Update cache
        this.fileCache.set(path, {
            content,
            mtime: Date.now(),
            type: vscode.FileType.File
        });

        // Notify file change
        this._onDidChangeFile.fire([{
            type: vscode.FileChangeType.Changed,
            uri
        }]);
    }

    async delete(uri: vscode.Uri, _options: { recursive: boolean }): Promise<void> {
        const path = uri.path;

        if (!this.wsClient.getConnectionStatus()) {
            throw vscode.FileSystemError.Unavailable('WebSocket not connected');
        }

        // Send delete request
        this.wsClient.deleteFile(path);

        // Remove from cache
        this.fileCache.delete(path);

        // Notify file change
        this._onDidChangeFile.fire([{
            type: vscode.FileChangeType.Deleted,
            uri
        }]);
    }

    rename(oldUri: vscode.Uri, newUri: vscode.Uri, _options: { overwrite: boolean }): void | Thenable<void> {
        // Read old file, write to new location, delete old file
        return this.readFile(oldUri).then(content => {
            return this.writeFile(newUri, content, { create: true, overwrite: true }).then(() => {
                return this.delete(oldUri, { recursive: false });
            });
        });
    }

    /**
     * Clear file cache
     */
    clearCache(): void {
        this.fileCache.clear();
    }

    /**
     * Update file in cache (called when receiving file updates from WebSocket)
     */
    updateFileCache(path: string, content: string): void {
        const contentBytes = new TextEncoder().encode(content);
        this.fileCache.set(path, {
            content: contentBytes,
            mtime: Date.now(),
            type: vscode.FileType.File
        });

        // Notify file change
        this._onDidChangeFile.fire([{
            type: vscode.FileChangeType.Changed,
            uri: vscode.Uri.parse(`cloudconstruct:${path}`)
        }]);
    }
}
