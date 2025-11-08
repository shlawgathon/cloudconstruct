/**
 * WebSocket message types
 * Type definitions for WebSocket messages
 */

export interface BaseMessage {
    type: string;
    timestamp: number;
}

export interface ClusterStatusDetails {
    nodes?: number;
    pods?: number;
    services?: number;
    deployments?: number;
    [key: string]: unknown;
}

export interface ClusterStatusMessage extends BaseMessage {
    type: 'cluster_status';
    status: 'healthy' | 'degraded' | 'unhealthy';
    details?: ClusterStatusDetails;
}

export interface ErrorMessage extends BaseMessage {
    type: 'error';
    error: string;
    code?: number;
}

/**
 * Webview message types
 * Type definitions for messages sent from webview to extension
 */
export interface WebviewMessage {
    command: string;
    [key: string]: unknown;
}

export interface LoginMessage extends WebviewMessage {
    command: 'login';
    username?: string;
    password?: string;
    email?: string;
}

export interface SignUpMessage extends WebviewMessage {
    command: 'signup';
    username?: string;
    email?: string;
    password?: string;
}

export interface OpenBrowserMessage extends WebviewMessage {
    command: 'openBrowser';
}

export type WebviewCommandMessage = LoginMessage | SignUpMessage | OpenBrowserMessage;

// TODO: Add more message types as needed

