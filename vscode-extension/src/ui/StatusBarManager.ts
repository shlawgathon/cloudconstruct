import * as vscode from 'vscode';

/**
 * Connection status in status bar
 * Displays connection status in the VS Code status bar
 */
export class StatusBarManager {
    private statusBarItem: vscode.StatusBarItem;

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.statusBarItem.command = 'vscodeAiExcalidraw.showStatus';
    }

    updateStatus(status: 'connected' | 'disconnected' | 'connecting' | 'error'): void {
        // TODO: Update status bar item with appropriate icon and text
        switch (status) {
            case 'connected':
                this.statusBarItem.text = '$(check) CloudConstruct';
                this.statusBarItem.tooltip = 'CloudConstruct: Connected';
                this.statusBarItem.backgroundColor = undefined;
                break;
            case 'disconnected':
                this.statusBarItem.text = '$(circle-slash) CloudConstruct';
                this.statusBarItem.tooltip = 'CloudConstruct: Disconnected';
                this.statusBarItem.backgroundColor = undefined;
                break;
            case 'connecting':
                this.statusBarItem.text = '$(sync~spin) CloudConstruct';
                this.statusBarItem.tooltip = 'CloudConstruct: Connecting...';
                this.statusBarItem.backgroundColor = undefined;
                break;
            case 'error':
                this.statusBarItem.text = '$(error) CloudConstruct';
                this.statusBarItem.tooltip = 'CloudConstruct: Error';
                this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
                break;
        }
        this.statusBarItem.show();
    }

    dispose(): void {
        this.statusBarItem.dispose();
    }
}


