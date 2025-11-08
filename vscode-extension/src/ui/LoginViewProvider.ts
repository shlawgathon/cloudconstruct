import * as vscode from 'vscode';
import { WebviewCommandMessage, LoginMessage, SignUpMessage } from '../types/messages';

/**
 * Login webview with: Draw your database to life intro + Login/Sign Up/Open in Browser buttons
 */
export class LoginViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'vscodeAiExcalidraw.loginView';

    private _view?: vscode.WebviewView;

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
                this._extensionUri
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

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

    private handleLogin(_message: LoginMessage): void {
        // TODO: Implement login logic
        vscode.window.showInformationMessage('Login clicked');
    }

    private handleSignUp(_message: SignUpMessage): void {
        // TODO: Implement signup logic
        vscode.window.showInformationMessage('Sign Up clicked');
    }

    private handleOpenBrowser() {
        // TODO: Open browser to signup/login page
        vscode.env.openExternal(vscode.Uri.parse('https://cloudconstruct.io'));
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const config = vscode.workspace.getConfiguration('cloudconstruct');
        const nextJsUrl = config.get<string>('nextJsUrl', 'http://localhost:3001');

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CloudConstruct Login</title>
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
    <iframe src="${nextJsUrl}" id="login-frame"></iframe>
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
            const iframe = document.getElementById('login-frame');
            if (iframe && iframe.contentWindow) {
                iframe.contentWindow.postMessage(event.data, '*');
            }
        });
    </script>
</body>
</html>`;
    }
}

