import * as vscode from 'vscode';
import { LoginViewProvider } from './ui/LoginViewProvider';
import { StatusView } from './cluster/StatusView';
import { AuthManager } from './auth/AuthManager';
import { WorkerApiClient } from './client/WorkerApiClient';
import { VSCodeWorkerClient } from './client/VSCodeWorkerClientWrapper';
import { FileSystemProvider } from './filesystem/FileSystemProvider';
import { FileSystemCommands } from './filesystem/FileSystemCommands';
import { ClusterCheckManager } from './cluster/ClusterCheckManager';
import { StatusBarManager } from './ui/StatusBarManager';
import { WebviewProvider } from './ui/WebviewProvider';
import { SpecFileWatcher } from './cluster/SpecFileWatcher';

// Create output channel for extension logs
const outputChannel = vscode.window.createOutputChannel('CloudConstruct');

/**
 * Extension activation and registration
 */
export function activate(context: vscode.ExtensionContext) {
    try {
        outputChannel.appendLine('CloudConstruct AI Excalidraw Extension is now active!');
        outputChannel.show(true); // Show output channel in the panel

        const extensionUri = context.extensionUri;
        const config = vscode.workspace.getConfiguration('cloudconstruct');

        // Initialize core services
        const workerUrl = config.get<string>('workerUrl', 'http://0.0.0.0:5353');
        
        // Create WebSocket client (shared API client)
        const webSocket = new VSCodeWorkerClient(workerUrl);
        
        // Create AuthManager with WebSocket client (so it can use the shared client's authenticate)
        const authManager = new AuthManager(context, workerUrl, webSocket);
        
        // Create API client with WebSocket
        const apiClient = new WorkerApiClient(workerUrl, webSocket);

        // Initialize UI components
        const loginViewProvider = new LoginViewProvider(extensionUri, context, authManager);
        const statusView = new StatusView();
        const statusBarManager = new StatusBarManager();
        const webviewProvider = new WebviewProvider(extensionUri, context);

        // Register webview providers
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(
                LoginViewProvider.viewType,
                loginViewProvider
            )
        );

        // Register tree data provider
        context.subscriptions.push(
            vscode.window.createTreeView('vscodeAiExcalidraw.clusterStatus', {
                treeDataProvider: statusView
            })
        );

        // Register file system provider with WebSocket client
        const fileSystemProvider = new FileSystemProvider(webSocket);
        context.subscriptions.push(
            vscode.workspace.registerFileSystemProvider('cloudconstruct', fileSystemProvider, {
                isCaseSensitive: false
            })
        );

        // Initialize file system commands
        const fileSystemCommands = new FileSystemCommands(fileSystemProvider);
        fileSystemCommands.registerCommands(context);

        // Initialize cluster check manager
        const clusterCheckManager = new ClusterCheckManager(apiClient, webSocket, statusView);
        clusterCheckManager.initialize(context);

        // Initialize spec file watcher
        const specFileWatcher = new SpecFileWatcher();
        specFileWatcher.initialize(context);

        // Register commands
        context.subscriptions.push(
            vscode.commands.registerCommand('vscodeAiExcalidraw.login', () => {
                vscode.commands.executeCommand('vscodeAiExcalidraw.loginView.focus');
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('vscodeAiExcalidraw.signup', () => {
                vscode.commands.executeCommand('vscodeAiExcalidraw.loginView.focus');
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('vscodeAiExcalidraw.openBrowser', () => {
                vscode.env.openExternal(vscode.Uri.parse('https://cloudconstruct.io'));
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('vscodeAiExcalidraw.showStatus', async () => {
                await webviewProvider.show();
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('vscodeAiExcalidraw.checkCluster', async () => {
                await clusterCheckManager.checkCluster();
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('vscodeAiExcalidraw.logout', async () => {
                const confirm = await vscode.window.showWarningMessage(
                    'Are you sure you want to logout?',
                    { modal: true },
                    'Logout'
                );

                if (confirm === 'Logout') {
                    webSocket.disconnect();
                    await authManager.logout();
                    vscode.window.showInformationMessage('Logged out successfully');
                    statusBarManager.updateStatus('disconnected');
                }
            })
        );

        // Register command to connect WebSocket (called after login)
        context.subscriptions.push(
            vscode.commands.registerCommand('vscodeAiExcalidraw.connectWebSocket', async () => {
                await connectWebSocket();
            })
        );

        // Initialize status bar
        statusBarManager.updateStatus('disconnected');

        // Set up WebSocket event handlers (once during initialization)
        webSocket.onConnect(() => {
            statusBarManager.updateStatus('connected');
            outputChannel.appendLine('WebSocket connected');
        });

        webSocket.onDisconnect(() => {
            statusBarManager.updateStatus('disconnected');
            outputChannel.appendLine('WebSocket disconnected');
        });

        webSocket.onError((error) => {
            outputChannel.appendLine(`WebSocket error: ${error.message}`);
            // Only show error message if it's a critical error
            if (!webSocket.getConnectionStatus()) {
                vscode.window.showErrorMessage(`WebSocket error: ${error.message}`);
            }
        });

        // Connect WebSocket after authentication
        const connectWebSocket = async () => {
            if (authManager.isAuthenticated()) {
                const token = authManager.getSessionToken();
                if (token) {
                    try {
                        await webSocket.connectWithToken(token);
                    } catch (error) {
                        outputChannel.appendLine(`Failed to connect WebSocket: ${error}`);
                        statusBarManager.updateStatus('error');
                    }
                }
            }
        };

        // Connect WebSocket if auto-check is enabled and user is authenticated
        if (config.get<boolean>('autoCheck', true)) {
            connectWebSocket();
        }

        // Listen for authentication changes and connect/disconnect WebSocket
        const authCheckInterval = setInterval(async () => {
            if (authManager.isAuthenticated() && !webSocket.getConnectionStatus()) {
                await connectWebSocket();
            } else if (!authManager.isAuthenticated() && webSocket.getConnectionStatus()) {
                webSocket.disconnect();
                statusBarManager.updateStatus('disconnected');
            }
        }, 5000); // Check every 5 seconds

        context.subscriptions.push({
            dispose: () => {
                clearInterval(authCheckInterval);
                webSocket.disconnect();
            }
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`[ERROR] Failed to activate extension: ${errorMessage}`);
        outputChannel.appendLine(`[ERROR] Stack: ${error instanceof Error ? error.stack : 'No stack trace'}`);
        outputChannel.show(true);
        console.error('CloudConstruct extension activation error:', error);
    }
}

/**
 * Extension deactivation
 */
export function deactivate() {
    outputChannel.appendLine('CloudConstruct AI Excalidraw Extension is now deactivated');
    outputChannel.dispose();
}

