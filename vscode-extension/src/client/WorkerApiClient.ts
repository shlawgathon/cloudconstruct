import { VSCodeWorkerClient } from './VSCodeWorkerClientWrapper';

/**
 * Shared TypeScript API client for Worker communication
 * Wraps the WebSocket client for API operations
 * This is a thin wrapper around the shared API client
 */
export class WorkerApiClient {
    private _baseUrl: string;
    private _wsClient: VSCodeWorkerClient;

    constructor(baseUrl: string, wsClient?: VSCodeWorkerClient) {
        this._baseUrl = baseUrl;
        this._wsClient = wsClient || new VSCodeWorkerClient(baseUrl);
    }

    /**
     * Get the WebSocket client instance
     */
    getWebSocketClient(): VSCodeWorkerClient {
        return this._wsClient;
    }

    /**
     * Get base URL
     */
    getBaseUrl(): string {
        return this._baseUrl;
    }
}

