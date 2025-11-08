// worker-api-client.ts - Shared TypeScript client for VSCode and Excalidraw

export interface AuthRequest {
    username: string;
    password: string;
}

export interface AuthResponse {
    sessionToken: string;
    expiresAt: number;
}

// WebSocket Message Types
export type WSMessage =
    | AuthMessage
    | FileOperationMessage
    | WhiteboardUpdateMessage
    | StatusUpdateMessage
    | CodeGenRequestMessage
    | CodeGenResponseMessage
    | ClusterCheckRequestMessage
    | ClusterCheckResponseMessage;

export interface AuthMessage {
    type: 'auth';
    token: string;
}

export interface FileOperationMessage {
    type: 'fileOperation';
    operation: 'list' | 'read' | 'create' | 'update' | 'delete' | 'search';
    path?: string;
    content?: string;
    searchQuery?: string;
}

export interface WhiteboardElement {
    id: string;
    type: string;
    x: number;
    y: number;
    width?: number;
    height?: number;
    text?: string;
    points?: Array<{ x: number; y: number }>;
}

export interface WhiteboardUpdateMessage {
    type: 'whiteboardUpdate';
    componentId: string;
    elements: WhiteboardElement[];
    screenshot?: string; // base64 encoded
}

export enum ComponentStatus {
    LOADING = 'LOADING',
    SUCCESS = 'SUCCESS',
    FAILURE = 'FAILURE',
    CHECKING = 'CHECKING',
    READY = 'READY'
}

export interface StatusUpdateMessage {
    type: 'statusUpdate';
    componentId: string;
    status: ComponentStatus;
    message?: string;
}

export interface CodeGenContext {
    whiteboard: WhiteboardElement[];
    files: string[];
    previousComponents?: string[];
}

export interface CodeGenRequestMessage {
    type: 'codeGenRequest';
    prompt: string;
    context: CodeGenContext;
    componentId: string;
}

export interface CodeGenResponseMessage {
    type: 'codeGenResponse';
    componentId: string;
    code: string;
    specFile: string;
    status: string;
}

export interface ClusterCheckRequestMessage {
    type: 'clusterCheckRequest';
    componentId: string;
    specFile: string;
}

export interface ClusterCheckResponseMessage {
    type: 'clusterCheckResponse';
    componentId: string;
    status: string;
    k8sCode?: string;
    errors?: string[];
}

// Event types for callbacks
export type MessageHandler = (message: WSMessage) => void;
export type ConnectionHandler = () => void;
export type ErrorHandler = (error: Error) => void;

/**
 * Base WebSocket Client for communicating with the Kotlin worker
 */
export class WorkerWSClient {
    // Cross-runtime helpers
    private getWebSocketConstructor = async (): Promise<any> => {
        // Browser or runtimes exposing global WebSocket
        const g: any = globalThis as any;
        if (typeof g.WebSocket !== 'undefined') {
            return g.WebSocket;
        }
        // Node.js: dynamically import 'ws' to avoid bundling it in the browser build
        const mod: any = await import('ws');
        const WS = mod.WebSocket || mod.default || mod;
        if (!WS) {
            throw new Error('Unable to load WebSocket implementation');
        }
        return WS;
    };

    private toBase64 = (str: string): string => {
        const g: any = globalThis as any;
        if (typeof g.btoa === 'function') {
            return g.btoa(str);
        }
        // Node.js
        return Buffer.from(str, 'utf-8').toString('base64');
    };
    private ws: any = null;
    private sessionToken: string | null = null;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectDelay = 1000; // Start with 1 second
    private messageHandlers: Set<MessageHandler> = new Set();
    private connectionHandlers: Set<ConnectionHandler> = new Set();
    private disconnectionHandlers: Set<ConnectionHandler> = new Set();
    private errorHandlers: Set<ErrorHandler> = new Set();
    private messageQueue: WSMessage[] = [];
    private isConnected = false;
    private clientType: 'vsc' | 'excalidraw';
    private workerUrl: string;

    constructor(workerUrl: string, clientType: 'vsc' | 'excalidraw') {
        this.workerUrl = workerUrl;
        this.clientType = clientType;
    }

    /**
     * Authenticate and get session token
     */
    async authenticate(username: string, password: string): Promise<string> {
        const authUrl = `${this.workerUrl.replace('ws://', 'http://').replace('wss://', 'https://')}/auth`;

        const response = await fetch(authUrl, {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + this.toBase64(`${username}:${password}`)
            }
        });

        if (!response.ok) {
            throw new Error(`Authentication failed: ${response.status} ${response.statusText}`);
        }

        const data: any = await response.json();
        if (!data || typeof data.sessionToken !== 'string') {
            throw new Error('Invalid authentication response: missing sessionToken');
        }
        this.sessionToken = data.sessionToken;
        return data.sessionToken;
    }

    /**
     * Connect to WebSocket with existing session token
     */
    async connectWithToken(token: string): Promise<void> {
        this.sessionToken = token;
        return this.connect();
    }

    /**
     * Connect to WebSocket
     */
    async connect(): Promise<void> {
        if (!this.sessionToken) {
            throw new Error('No session token available. Please authenticate first.');
        }

        return new Promise(async (resolve, reject) => {
            try {
                const WS = await this.getWebSocketConstructor();
                const wsEndpoint = this.clientType === 'vsc' ? '/ws/vsc' : '/ws/excalidraw';
                const url = `${this.workerUrl}${wsEndpoint}`;
                this.ws = new WS(url);

                const handleOpen = () => {
                    console.log(`Connected to worker as ${this.clientType}`);
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    this.reconnectDelay = 1000;

                    // Send auth message
                    const authMessage: AuthMessage = {
                        type: 'auth',
                        token: this.sessionToken!
                    };
                    this.ws!.send(JSON.stringify(authMessage));

                    // Process queued messages
                    while (this.messageQueue.length > 0) {
                        const message = this.messageQueue.shift();
                        if (message) {
                            this.send(message);
                        }
                    }

                    // Notify handlers
                    this.connectionHandlers.forEach(handler => handler());
                    resolve();
                };

                const handleMessage = (data: any) => {
                    try {
                        const raw = typeof data === 'string' ? data : (data?.data ?? data);
                        const message = JSON.parse(raw) as WSMessage;
                        this.handleMessage(message);
                    } catch (error) {
                        console.error('Failed to parse message:', error);
                        this.errorHandlers.forEach(handler => handler(error as Error));
                    }
                };

                const handleError = (error: any) => {
                    console.error('WebSocket error:', error);
                    this.errorHandlers.forEach(handler => handler(new Error('WebSocket error')));
                    reject(new Error('WebSocket connection failed'));
                };

                const handleClose = () => {
                    console.log('WebSocket connection closed');
                    this.isConnected = false;
                    this.disconnectionHandlers.forEach(handler => handler());

                    // Attempt reconnection
                    if (this.reconnectAttempts < this.maxReconnectAttempts) {
                        this.reconnect();
                    }
                };

                // Attach handlers for browser or Node ws
                if (typeof this.ws.addEventListener === 'function') {
                    this.ws.addEventListener('open', handleOpen);
                    this.ws.addEventListener('message', (evt: any) => handleMessage(evt.data));
                    this.ws.addEventListener('error', handleError);
                    this.ws.addEventListener('close', handleClose);
                } else if (typeof this.ws.on === 'function') {
                    this.ws.on('open', handleOpen);
                    this.ws.on('message', (data: any) => handleMessage(data));
                    this.ws.on('error', handleError);
                    this.ws.on('close', handleClose);
                } else {
                    // Fallback to direct assignment if supported
                    (this.ws as any).onopen = handleOpen;
                    (this.ws as any).onmessage = (evt: any) => handleMessage(evt?.data ?? evt);
                    (this.ws as any).onerror = handleError;
                    (this.ws as any).onclose = handleClose;
                }
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Reconnect with exponential backoff
     */
    private async reconnect(): Promise<void> {
        this.reconnectAttempts++;
        console.log(`Reconnecting... Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);

        await new Promise(resolve => setTimeout(resolve, this.reconnectDelay));
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000); // Max 30 seconds

        try {
            await this.connect();
        } catch (error) {
            console.error('Reconnection failed:', error);
        }
    }

    /**
     * Send a message
     */
    send(message: WSMessage): void {
        if (!this.isConnected) {
            this.messageQueue.push(message as WSMessage);
            return;
        }

        const OPEN_STATE = 1; // WebSocket.OPEN in both browser and 'ws'
        if (this.ws && this.ws.readyState === OPEN_STATE) {
            try {
                this.ws.send(JSON.stringify(message));
            } catch (err) {
                // If send fails, re-queue to attempt after reconnect
                this.messageQueue.push(message as WSMessage);
            }
        } else {
            this.messageQueue.push(message as WSMessage);
        }
    }

    /**
     * Handle incoming messages
     */
    private handleMessage(message: WSMessage): void {
        this.messageHandlers.forEach(handler => handler(message));
    }

    /**
     * Register message handler
     */
    onMessage(handler: MessageHandler): void {
        this.messageHandlers.add(handler);
    }

    /**
     * Register connection handler
     */
    onConnect(handler: ConnectionHandler): void {
        this.connectionHandlers.add(handler);
    }

    /**
     * Register disconnection handler
     */
    onDisconnect(handler: ConnectionHandler): void {
        this.disconnectionHandlers.add(handler);
    }

    /**
     * Register error handler
     */
    onError(handler: ErrorHandler): void {
        this.errorHandlers.add(handler);
    }

    /**
     * Remove handlers
     */
    removeHandler(handler: MessageHandler | ConnectionHandler | ErrorHandler): void {
        this.messageHandlers.delete(handler as MessageHandler);
        this.connectionHandlers.delete(handler as ConnectionHandler);
        this.disconnectionHandlers.delete(handler as ConnectionHandler);
        this.errorHandlers.delete(handler as ErrorHandler);
    }

    /**
     * Close connection
     */
    disconnect(): void {
        this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnection
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
        this.sessionToken = null;
    }

    /**
     * Get connection status
     */
    getConnectionStatus(): boolean {
        return this.isConnected;
    }
}

/**
 * VSCode-specific client with file operations
 */
export class VSCodeWorkerClient extends WorkerWSClient {
    constructor(workerUrl: string) {
        super(workerUrl, 'vsc');
    }

    // File operations
    async listFiles(path?: string): Promise<void> {
        this.send({
            type: 'fileOperation',
            operation: 'list',
            path
        });
    }

    async readFile(path: string): Promise<void> {
        this.send({
            type: 'fileOperation',
            operation: 'read',
            path
        });
    }

    async createFile(path: string, content: string): Promise<void> {
        this.send({
            type: 'fileOperation',
            operation: 'create',
            path,
            content
        });
    }

    async updateFile(path: string, content: string): Promise<void> {
        this.send({
            type: 'fileOperation',
            operation: 'update',
            path,
            content
        });
    }

    async deleteFile(path: string): Promise<void> {
        this.send({
            type: 'fileOperation',
            operation: 'delete',
            path
        });
    }

    async searchFiles(query: string): Promise<void> {
        this.send({
            type: 'fileOperation',
            operation: 'search',
            searchQuery: query
        });
    }

    // Cluster operations
    requestClusterCheck(componentId: string, specFile: string): void {
        this.send({
            type: 'clusterCheckRequest',
            componentId,
            specFile
        });
    }

    // Status updates
    updateComponentStatus(componentId: string, status: ComponentStatus, message?: string): void {
        this.send({
            type: 'statusUpdate',
            componentId,
            status,
            message
        });
    }
}

/**
 * Excalidraw-specific client with whiteboard operations
 */
export class ExcalidrawWorkerClient extends WorkerWSClient {
    constructor(workerUrl: string) {
        super(workerUrl, 'excalidraw');
    }

    // Whiteboard operations
    updateWhiteboard(
        componentId: string,
        elements: WhiteboardElement[],
        screenshot?: string
    ): void {
        this.send({
            type: 'whiteboardUpdate',
            componentId,
            elements,
            screenshot
        });
    }

    // Code generation
    requestCodeGeneration(
        componentId: string,
        prompt: string,
        context: CodeGenContext
    ): void {
        this.send({
            type: 'codeGenRequest',
            prompt,
            context,
            componentId
        });
    }
}

// Helper function to create periodic whiteboard checks
export class WhiteboardMonitor {
    private client: ExcalidrawWorkerClient;
    private interval: number;
    private timer: ReturnType<typeof setInterval> | null = null;
    private getElements: () => WhiteboardElement[];
    private getScreenshot: () => string | undefined;
    private lastElementsHash: string = '';

    constructor(
        client: ExcalidrawWorkerClient,
        getElements: () => WhiteboardElement[],
        getScreenshot: () => string | undefined,
        interval: number = 1000
    ) {
        this.client = client;
        this.interval = interval;
        this.getElements = getElements;
        this.getScreenshot = getScreenshot;
    }

    start(componentId: string): void {
        if (this.timer) {
            this.stop();
        }

        this.timer = setInterval(() => {
            const elements = this.getElements();
            const elementsHash = JSON.stringify(elements);

            // Only send update if elements changed
            if (elementsHash !== this.lastElementsHash) {
                this.lastElementsHash = elementsHash;
                const screenshot = this.getScreenshot();
                this.client.updateWhiteboard(componentId, elements, screenshot);
            }
        }, this.interval);
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    forceUpdate(componentId: string): void {
        const elements = this.getElements();
        const screenshot = this.getScreenshot();
        this.client.updateWhiteboard(componentId, elements, screenshot);
    }
}
