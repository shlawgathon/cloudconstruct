import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { WebviewCommandMessage, LoginMessage, SignUpMessage } from '../types/messages';

/**
 * Next.js webview provider for VSCode extension
 * Serves the Next.js app built with Bun
 */
export class NextJsViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'vscodeAiExcalidraw.loginView';

    private _view?: vscode.WebviewView;
    private _nextJsPort: number = 3001;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _context: vscode.ExtensionContext
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri,
                vscode.Uri.joinPath(this._extensionUri, '..', 'ui-app')
            ]
        };

        // Check if Next.js is running in dev mode or use built version
        const nextJsUrl = this.getNextJsUrl();
        
        if (nextJsUrl) {
            // Use Next.js dev server or production build
            webviewView.webview.html = this._getDevHtml(webviewView.webview, nextJsUrl);
        } else {
            // Fallback to static HTML
            webviewView.webview.html = this._getStaticHtml(webviewView.webview);
        }

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(
            (message: WebviewCommandMessage) => {
                switch (message.command) {
                    case 'login':
                        this.handleLogin(message);
                        break;
                    case 'signup':
                        this.handleSignUp(message);
                        break;
                    case 'openBrowser':
                        this.handleOpenBrowser();
                        break;
                }
            },
            null,
            this._context.subscriptions
        );
    }

    private getNextJsUrl(): string | null {
        // Check if Next.js dev server is running
        // In production, this would point to the built Next.js app
        const config = vscode.workspace.getConfiguration('cloudconstruct');
        const nextJsUrl = config.get<string>('nextJsUrl');
        
        if (nextJsUrl) {
            return nextJsUrl;
        }

        // Check for built Next.js app
        const uiAppPath = path.join(this._context.extensionPath, 'ui-app', '.next');
        if (fs.existsSync(uiAppPath)) {
            // In production, serve from built files
            return null; // Will use static HTML fallback for now
        }

        // Default to dev server
        return `http://localhost:${this._nextJsPort}`;
    }

    private _getDevHtml(_webview: vscode.Webview, nextJsUrl: string): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CloudConstruct</title>
    <script>
        // VSCode API bridge
        const vscode = acquireVsCodeApi();
        window.vscode = vscode;
    </script>
</head>
<body>
    <iframe 
        src="${nextJsUrl}" 
        style="width: 100%; height: 100vh; border: none;"
        allow="clipboard-read; clipboard-write"
    ></iframe>
    <script>
        // Listen for messages from Next.js app
        window.addEventListener('message', (event) => {
            if (event.origin === '${nextJsUrl}') {
                vscode.postMessage(event.data);
            }
        });
    </script>
</body>
</html>`;
    }

    private _getStaticHtml(_webview: vscode.Webview): string {
        // Fallback static HTML if Next.js isn't available
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CloudConstruct</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #1e1e1e;
            color: #cccccc;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
        }
        .message {
            text-align: center;
            padding: 2rem;
        }
    </style>
</head>
<body>
    <div class="message">
        <h1>Starting Next.js app...</h1>
        <p>Please run: cd ui-app && bun run dev</p>
    </div>
</body>
</html>`;
    }

    private handleLogin(_message: LoginMessage): void {
        vscode.window.showInformationMessage('Login clicked');
        // TODO: Implement login logic
    }

    private handleSignUp(_message: SignUpMessage): void {
        vscode.window.showInformationMessage('Sign Up clicked');
        // TODO: Implement signup logic
    }

    private handleOpenBrowser() {
        vscode.env.openExternal(vscode.Uri.parse('https://cloudconstruct.io'));
    }
}

