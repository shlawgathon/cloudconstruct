import * as vscode from 'vscode';

/**
 * Detailed status webview
 * Provides a detailed view of cluster status and operations
 */
export class WebviewProvider {
    private panel: vscode.WebviewPanel | undefined;

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly context: vscode.ExtensionContext
    ) {}

    async show(): Promise<void> {
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'cloudconstructStatus',
            'CloudConstruct Status',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [this.extensionUri]
            }
        );

        this.panel.webview.html = this.getHtmlForWebview(this.panel.webview);

        this.panel.onDidDispose(
            () => {
                this.panel = undefined;
            },
            null,
            this.context.subscriptions
        );

        // Handle messages from webview
        this.panel.webview.onDidReceiveMessage(
            (message) => {
                // TODO: Handle webview messages
                const outputChannel = vscode.window.createOutputChannel('CloudConstruct');
                outputChannel.appendLine(`[Webview] Received message: ${JSON.stringify(message)}`);
            },
            null,
            this.context.subscriptions
        );
    }

    private getHtmlForWebview(webview: vscode.Webview): string {
        const config = vscode.workspace.getConfiguration('cloudconstruct');
        const nextJsUrl = config.get<string>('nextJsUrl', 'http://localhost:3001');

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CloudConstruct Status</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            overflow: hidden;
        }
        iframe {
            width: 100%;
            height: 100vh;
            border: none;
        }
    </style>
</head>
<body>
    <iframe src="${nextJsUrl}/status" id="status-frame"></iframe>
    <script>
        const vscode = acquireVsCodeApi();
        
        // Expose vscode API to iframe
        window.addEventListener('message', (event) => {
            if (event.data && event.data.command) {
                vscode.postMessage(event.data);
            }
        });
        
        // Listen for messages from extension
        window.addEventListener('message', (event) => {
            const iframe = document.getElementById('status-frame');
            if (iframe && iframe.contentWindow) {
                iframe.contentWindow.postMessage(event.data, '*');
            }
        });
    </script>
</body>
</html>`;
    }
}
