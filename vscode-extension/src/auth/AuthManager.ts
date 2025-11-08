import * as vscode from 'vscode';
import axios, { AxiosError } from 'axios';
import { VSCodeWorkerClient } from '../client/VSCodeWorkerClientWrapper';

/**
 * Authentication manager for CloudConstruct whiteboard
 * Manages session token-based authentication with the worker backend
 * Uses VSCode SecretStorage for secure token storage
 * Uses the shared API client for authentication
 */

interface AuthResponse {
    sessionToken: string;
    expiresAt?: number;
    userId?: string;
}

export interface UserInfo {
    id: string;
    username: string;
}

export class AuthManager {
    private static readonly SESSION_TOKEN_KEY = 'cloudconstruct.session.token';
    private static readonly USER_INFO_KEY = 'cloudconstruct.user.info';
    
    private sessionToken: string | null = null;
    private userInfo: UserInfo | null = null;
    private workerUrl: string;
    private wsClient: VSCodeWorkerClient;

    constructor(
        private readonly context: vscode.ExtensionContext,
        workerUrl?: string,
        wsClient?: VSCodeWorkerClient
    ) {
        // Get worker URL from config or use default
        const config = vscode.workspace.getConfiguration('cloudconstruct');
        this.workerUrl = workerUrl || config.get<string>('workerUrl', 'http://0.0.0.0:5353');
        
        // Create or use provided WebSocket client for authentication
        this.wsClient = wsClient || new VSCodeWorkerClient(this.workerUrl);
        
        // Load stored session on initialization
        this.loadSession();
    }

    /**
     * Load session from secure storage
     */
    private async loadSession(): Promise<void> {
        try {
            // Load session token from SecretStorage
            this.sessionToken = await this.context.secrets.get(AuthManager.SESSION_TOKEN_KEY) || null;
            
            // Load user info from global state
            this.userInfo = this.context.globalState.get<UserInfo>(AuthManager.USER_INFO_KEY) || null;
        } catch (error) {
            console.error('Failed to load session:', error);
            this.sessionToken = null;
            this.userInfo = null;
        }
    }

    /**
     * Save session to secure storage
     */
    private async saveSession(token: string, userInfo: UserInfo): Promise<void> {
        try {
            await this.context.secrets.store(AuthManager.SESSION_TOKEN_KEY, token);
            await this.context.globalState.update(AuthManager.USER_INFO_KEY, userInfo);
            this.sessionToken = token;
            this.userInfo = userInfo;
        } catch (error) {
            console.error('Failed to save session:', error);
            throw new Error('Failed to save authentication session');
        }
    }

    /**
     * Clear session from secure storage
     */
    private async clearSession(): Promise<void> {
        try {
            await this.context.secrets.delete(AuthManager.SESSION_TOKEN_KEY);
            await this.context.globalState.update(AuthManager.USER_INFO_KEY, undefined);
            this.sessionToken = null;
            this.userInfo = null;
        } catch (error) {
            console.error('Failed to clear session:', error);
        }
    }

    /**
     * Register a new user
     * Uses the shared API client's authenticate method after registration
     */
    async register(username: string, password: string): Promise<{ success: boolean; message: string; userId?: string }> {
        try {
            // Convert to base64 for Basic auth
            const credentials = Buffer.from(`${username}:${password}`).toString('base64');
            
            const response = await axios.post<AuthResponse>(
                `${this.workerUrl}/auth/register`,
                {},
                {
                    headers: {
                        'Authorization': `Basic ${credentials}`,
                        'Content-Type': 'application/json',
                    },
                    validateStatus: (status) => status < 500,
                }
            );

            if (response.status === 201 || response.status === 200) {
                // After successful registration, authenticate to get session token
                try {
                    const token = await this.wsClient.authenticate(username, password);
                    const userInfo: UserInfo = {
                        id: response.data.userId || username,
                        username: username,
                    };
                    await this.saveSession(token, userInfo);
                    
                    return {
                        success: true,
                        message: 'Registration successful',
                        userId: userInfo.id,
                    };
                } catch (authError) {
                    return {
                        success: false,
                        message: 'Registration succeeded but authentication failed',
                    };
                }
            } else if (response.status === 409) {
                return {
                    success: false,
                    message: 'Username already exists',
                };
            } else {
                return {
                    success: false,
                    message: 'Registration failed',
                };
            }
        } catch (error) {
            return this.handleError(error, 'Registration failed');
        }
    }

    /**
     * Login with username and password
     * Uses the shared API client's authenticate method
     */
    async login(username: string, password: string): Promise<{ success: boolean; message: string; userId?: string }> {
        try {
            // Use the shared API client's authenticate method
            const token = await this.wsClient.authenticate(username, password);
            
            const userInfo: UserInfo = {
                id: username, // Will be updated from user info endpoint if available
                username: username,
            };
            
            await this.saveSession(token, userInfo);
            
            // Optionally validate session and get user info
            try {
                const isValid = await this.validateSession();
                if (isValid && this.userInfo) {
                    userInfo.id = this.userInfo.id;
                }
            } catch (error) {
                // Session validation failed, but we have a token so continue
                console.warn('Session validation failed:', error);
            }
            
            return {
                success: true,
                message: 'Login successful',
                userId: userInfo.id,
            };
        } catch (error) {
            if (error instanceof Error) {
                if (error.message.includes('401') || error.message.includes('Authentication failed')) {
                    return {
                        success: false,
                        message: 'Invalid username or password',
                    };
                }
                return {
                    success: false,
                    message: error.message || 'Login failed',
                };
            }
            return this.handleError(error, 'Login failed');
        }
    }

    /**
     * Logout and clear session
     */
    async logout(): Promise<void> {
        try {
            // Call logout endpoint if we have a session token
            if (this.sessionToken) {
                await axios.post(
                    `${this.workerUrl}/auth/logout`,
                    {},
                    {
                        headers: {
                            'Authorization': `Bearer ${this.sessionToken}`,
                        },
                    }
                ).catch(err => {
                    // Log but don't throw - still clear local session
                    console.warn('Logout request failed:', err);
                });
            }
        } finally {
            // Always clear local session
            await this.clearSession();
        }
    }

    /**
     * Check if user is authenticated
     */
    isAuthenticated(): boolean {
        return this.sessionToken !== null && this.userInfo !== null;
    }

    /**
     * Get session token for API requests
     */
    getSessionToken(): string | null {
        return this.sessionToken;
    }

    /**
     * Get current user info
     */
    getUserInfo(): UserInfo | null {
        return this.userInfo;
    }

    /**
     * Validate current session with backend
     */
    async validateSession(): Promise<boolean> {
        if (!this.sessionToken) {
            return false;
        }

        try {
            const response = await axios.get(
                `${this.workerUrl}/user/me`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.sessionToken}`,
                    },
                    validateStatus: (status) => status < 500,
                }
            );

            if (response.status === 200) {
                // Update user info
                const userData = response.data;
                if (userData.id && this.userInfo) {
                    this.userInfo.id = userData.id;
                    await this.context.globalState.update(AuthManager.USER_INFO_KEY, this.userInfo);
                }
                return true;
            } else {
                // Session is invalid, clear it
                await this.clearSession();
                return false;
            }
        } catch (error) {
            console.error('Session validation failed:', error);
            await this.clearSession();
            return false;
        }
    }

    /**
     * Handle errors from API requests
     */
    private handleError(error: unknown, defaultMessage: string): { success: false; message: string } {
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError<{ error?: string }>;
            
            if (axiosError.code === 'ECONNREFUSED') {
                return {
                    success: false,
                    message: 'Cannot connect to server. Is the worker running?',
                };
            }
            
            return {
                success: false,
                message: axiosError.response?.data?.error || axiosError.message || defaultMessage,
            };
        }

        return {
            success: false,
            message: error instanceof Error ? error.message : defaultMessage,
        };
    }

    /**
     * Get the WebSocket client instance
     */
    getWebSocketClient(): VSCodeWorkerClient {
        return this.wsClient;
    }

    /**
     * Create axios instance with authentication
     * Useful for other services that need authenticated requests
     */
    createAuthenticatedClient() {
        return axios.create({
            baseURL: this.workerUrl,
            headers: this.sessionToken ? {
                'Authorization': `Bearer ${this.sessionToken}`,
            } : {},
        });
    }
}
