import * as vscode from 'vscode';
import { VSCodeWorkerClient, WSMessage, FileListResponseMessage } from 'shared-api-client';

export class ClientManager {
  private output: vscode.OutputChannel;
  private client: VSCodeWorkerClient | null = null;
  private tokenKey = 'cloudconstructV2.sessionToken';
  private disposables: Array<() => void> = [];

  constructor(private context: vscode.ExtensionContext) {
    this.output = vscode.window.createOutputChannel('CloudConstruct (v2)');
  }

  private get workerUrl(): string {
    const conf = vscode.workspace.getConfiguration();
    return conf.get<string>('cloudconstructV2.workerUrl', 'ws://localhost:5353');
  }

  log(msg: string) {
    const timestamp = new Date().toISOString();
    this.output.appendLine(`[${timestamp}] ${msg}`);
  }

  async authenticate(): Promise<string | null> {
    const username = await vscode.window.showInputBox({ prompt: 'Worker username', ignoreFocusOut: true });
    if (!username) { return null; }
    const password = await vscode.window.showInputBox({ prompt: 'Worker password', password: true, ignoreFocusOut: true });
    if (!password) { return null; }

    try {
      const client = new VSCodeWorkerClient(this.workerUrl);
      const token = await client.authenticate(username, password);
      await this.context.secrets.store(this.tokenKey, token);
      this.log('Authenticated successfully. Token stored in secrets.');
      return token;
    } catch (e: any) {
      vscode.window.showErrorMessage(`Authentication failed: ${e?.message ?? e}`);
      this.log(`Authentication error: ${e?.stack ?? e}`);
      return null;
    }
  }

  async connect(): Promise<boolean> {
    let token: string | null | undefined = await this.context.secrets.get(this.tokenKey);
    if (!token) {
      const proceed = await vscode.window.showWarningMessage('No session token found. Authenticate now?', 'Authenticate');
      if (proceed === 'Authenticate') {
        token = await this.authenticate();
      }
    }
    if (!token) { return false; }

    if (this.client) {
      this.log('Already connected or connecting.');
      return true;
    }

    this.client = new VSCodeWorkerClient(this.workerUrl);

    // Wire basic handlers
    const onMsg = (m: WSMessage) => {
      this.log(`<- ${m.type}`);
    };
    const onConn = () => this.log('Connected to worker.');
    const onDisc = () => this.log('Disconnected from worker.');
    const onErr = (err: Error) => this.log(`WS error: ${err.message}`);

    this.client.onMessage(onMsg);
    this.client.onConnect(onConn);
    this.client.onDisconnect(onDisc);
    this.client.onError(onErr);

    this.disposables.push(() => this.client?.removeHandler(onMsg));
    this.disposables.push(() => this.client?.removeHandler(onConn as any));
    this.disposables.push(() => this.client?.removeHandler(onDisc as any));
    this.disposables.push(() => this.client?.removeHandler(onErr as any));

    try {
      await this.client.connectWithToken(token);
      this.log('Connection established.');
      return true;
    } catch (e: any) {
      vscode.window.showErrorMessage(`Failed to connect: ${e?.message ?? e}`);
      this.log(`Connect error: ${e?.stack ?? e}`);
      this.client = null;
      return false;
    }
  }

  async disconnect() {
    if (this.client) {
      this.client.disconnect();
      this.client = null;
      this.disposables.forEach(d => d());
      this.disposables = [];
      this.log('Disconnected from worker.');
    }
  }

  isConnected(): boolean {
    return !!this.client && this.client.getConnectionStatus();
  }

  getOutput(): vscode.OutputChannel { return this.output; }

  // --- File listing with simple request/response awaiting ---
  async getAllFiles(timeoutMs = 8000): Promise<string[]> {
    if (!this.client) { throw new Error('Not connected'); }

    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.log(`-> fileListRequest (${requestId})`);

    return new Promise<string[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Timed out waiting for fileListResponse'));
      }, timeoutMs);

      const handler = (msg: WSMessage) => {
        if (msg.type === 'fileListResponse') {
          const resp = msg as FileListResponseMessage;
          if (!resp.requestId || resp.requestId === requestId) {
            cleanup();
            resolve(resp.files || []);
          }
        }
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.client?.removeHandler(handler as any);
      };

      this.client!.onMessage(handler);
      this.client!.requestFileList(requestId);
    });
  }

  // Local search over file list
  async searchFilesLocally(query: string): Promise<string[]> {
    const files = await this.getAllFiles();
    const q = query.toLowerCase();
    // Support simple space-delimited AND search across path substrings
    const terms = q.split(/\s+/).filter(Boolean);
    return files.filter(f => terms.every(t => f.toLowerCase().includes(t)));
  }

  async writeFile(path: string, content: string): Promise<void> {
    if (!this.client) { throw new Error('Not connected'); }
    this.log(`-> fileWriteRequest ${path}`);
    this.client.writeFile(path, content, true);
  }
}
