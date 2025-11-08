import * as vscode from 'vscode';
import { WebviewCommandMessage, LoginMessage, SignUpMessage } from '../types/messages';
import { AuthManager } from '../auth/AuthManager';

/**
 * Login webview with: Draw your database to life intro + Login/Sign Up/Open in Browser buttons
 */
export class LoginViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'vscodeAiExcalidraw.loginView';

    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _context: vscode.ExtensionContext,
        private readonly _authManager?: AuthManager
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

    private async handleLogin(_message: LoginMessage): Promise<void> {
        if (!this._authManager) {
            vscode.window.showErrorMessage('Authentication not configured');
            return;
        }

        // Prompt for username if not provided
        const username = await vscode.window.showInputBox({
            prompt: 'Enter your username',
            placeHolder: 'username',
            ignoreFocusOut: true,
        });

        if (!username) {
            return;
        }

        // Prompt for password
        const password = await vscode.window.showInputBox({
            prompt: 'Enter your password',
            placeHolder: 'password',
            password: true,
            ignoreFocusOut: true,
        });

        if (!password) {
            return;
        }

        // Show progress while logging in
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Logging in...',
                cancellable: false,
            },
            async () => {
                const result = await this._authManager!.login(username, password);
                
                if (result.success) {
                    vscode.window.showInformationMessage(`Welcome back, ${username}!`);
                    // Refresh the webview to show authenticated state
                    this.refreshView();
                    
                    // Notify extension to connect WebSocket
                    vscode.commands.executeCommand('vscodeAiExcalidraw.connectWebSocket');
                } else {
                    vscode.window.showErrorMessage(`Login failed: ${result.message}`);
                }
            }
        );
    }

    private async handleSignUp(_message: SignUpMessage): Promise<void> {
        if (!this._authManager) {
            vscode.window.showErrorMessage('Authentication not configured');
            return;
        }

        // Prompt for username
        const username = await vscode.window.showInputBox({
            prompt: 'Choose a username',
            placeHolder: 'username',
            ignoreFocusOut: true,
        });

        if (!username) {
            return;
        }

        // Prompt for password
        const password = await vscode.window.showInputBox({
            prompt: 'Choose a password (minimum 6 characters)',
            placeHolder: 'password',
            password: true,
            ignoreFocusOut: true,
            validateInput: (value) => {
                if (value.length < 6) {
                    return 'Password must be at least 6 characters';
                }
                return null;
            },
        });

        if (!password) {
            return;
        }

        // Confirm password
        const confirmPassword = await vscode.window.showInputBox({
            prompt: 'Confirm your password',
            placeHolder: 'password',
            password: true,
            ignoreFocusOut: true,
        });

        if (confirmPassword !== password) {
            vscode.window.showErrorMessage('Passwords do not match');
            return;
        }

        // Show progress while registering
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Creating account...',
                cancellable: false,
            },
            async () => {
                const result = await this._authManager!.register(username, password);
                
                if (result.success) {
                    vscode.window.showInformationMessage(`Account created successfully!`);
                    
                    // Auto-login after successful registration
                    const loginResult = await this._authManager!.login(username, password);
                    if (loginResult.success) {
                        vscode.window.showInformationMessage(`Welcome, ${username}!`);
                        this.refreshView();
                        
                        // Notify extension to connect WebSocket
                        vscode.commands.executeCommand('vscodeAiExcalidraw.connectWebSocket');
                    }
                } else {
                    vscode.window.showErrorMessage(`Sign up failed: ${result.message}`);
                }
            }
        );
    }

    private refreshView(): void {
        if (this._view) {
            this._view.webview.html = this._getHtmlForWebview(this._view.webview);
        }
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

