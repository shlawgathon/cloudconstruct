import * as vscode from 'vscode';
import axios, { AxiosError } from 'axios';

/**
 * Authentication manager for CloudConstruct whiteboard
 * Manages session-based authentication with the worker backend
 * Uses VSCode SecretStorage for secure cookie storage
 */

interface LoginRequest {
    username: string;
    password: string;
}

interface RegisterRequest {
    username: string;
    password: string;
    profilePictureBase64?: string;
}

interface AuthResponse {
    userId: string;
}

export interface UserInfo {
    id: string;
    username: string;
}

export class AuthManager {
    private static readonly SESSION_COOKIE_KEY = 'cloudconstruct.session.cookie';
    private static readonly USER_INFO_KEY = 'cloudconstruct.user.info';
    
    private sessionCookie: string | null = null;
    private userInfo: UserInfo | null = null;
    private workerUrl: string;

    constructor(
        private readonly context: vscode.ExtensionContext,
        workerUrl?: string
    ) {
        // Get worker URL from config or use default
        const config = vscode.workspace.getConfiguration('cloudconstruct');
        this.workerUrl = workerUrl || config.get<string>('workerUrl', 'http://localhost:3000');
        
        // Load stored session on initialization
        this.loadSession();
    }

    /**
     * Load session from secure storage
     */
    private async loadSession(): Promise<void> {
        try {
            // Load session cookie from SecretStorage
            this.sessionCookie = await this.context.secrets.get(AuthManager.SESSION_COOKIE_KEY) || null;
            
            // Load user info from global state
            this.userInfo = this.context.globalState.get<UserInfo>(AuthManager.USER_INFO_KEY) || null;
        } catch (error) {
            console.error('Failed to load session:', error);
            this.sessionCookie = null;
            this.userInfo = null;
        }
    }

    /**
     * Save session to secure storage
     */
    private async saveSession(cookie: string, userInfo: UserInfo): Promise<void> {
        try {
            await this.context.secrets.store(AuthManager.SESSION_COOKIE_KEY, cookie);
            await this.context.globalState.update(AuthManager.USER_INFO_KEY, userInfo);
            this.sessionCookie = cookie;
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
            await this.context.secrets.delete(AuthManager.SESSION_COOKIE_KEY);
            await this.context.globalState.update(AuthManager.USER_INFO_KEY, undefined);
            this.sessionCookie = null;
            this.userInfo = null;
        } catch (error) {
            console.error('Failed to clear session:', error);
        }
    }

    /**
     * Register a new user
     */
    async register(username: string, password: string): Promise<{ success: boolean; message: string; userId?: string }> {
        try {
            const request: RegisterRequest = { username, password };
            
            const response = await axios.post<AuthResponse>(
                `${this.workerUrl}/auth/register`,
                request,
                {
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    validateStatus: (status) => status < 500,
                }
            );

            if (response.status === 201) {
                return {
                    success: true,
                    message: 'Registration successful',
                    userId: response.data.userId,
                };
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
     */
    async login(username: string, password: string): Promise<{ success: boolean; message: string; userId?: string }> {
        try {
            const request: LoginRequest = { username, password };
            
            const response = await axios.post<AuthResponse>(
                `${this.workerUrl}/auth/login`,
                request,
                {
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    validateStatus: (status) => status < 500,
                }
            );

            if (response.status === 200) {
                // Extract session cookie from Set-Cookie header
                const setCookieHeader = response.headers['set-cookie'];
                if (setCookieHeader && setCookieHeader.length > 0) {
                    // Parse the USER_SESSION cookie
                    const sessionCookie = this.extractSessionCookie(setCookieHeader);
                    if (sessionCookie) {
                        // Save session
                        const userInfo: UserInfo = {
                            id: response.data.userId,
                            username: username,
                        };
                        await this.saveSession(sessionCookie, userInfo);
                        
                        return {
                            success: true,
                            message: 'Login successful',
                            userId: response.data.userId,
                        };
                    }
                }
                
                return {
                    success: false,
                    message: 'Failed to establish session',
                };
            } else if (response.status === 401) {
                return {
                    success: false,
                    message: 'Invalid username or password',
                };
            } else {
                return {
                    success: false,
                    message: 'Login failed',
                };
            }
        } catch (error) {
            return this.handleError(error, 'Login failed');
        }
    }

    /**
     * Logout and clear session
     */
    async logout(): Promise<void> {
        try {
            // Call logout endpoint if we have a session
            if (this.sessionCookie) {
                await axios.post(
                    `${this.workerUrl}/auth/logout`,
                    {},
                    {
                        headers: {
                            'Cookie': this.sessionCookie,
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
        return this.sessionCookie !== null && this.userInfo !== null;
    }

    /**
     * Get session cookie for API requests
     */
    getSessionCookie(): string | null {
        return this.sessionCookie;
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
        if (!this.sessionCookie) {
            return false;
        }

        try {
            const response = await axios.get(
                `${this.workerUrl}/user/me`,
                {
                    headers: {
                        'Cookie': this.sessionCookie,
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
     * Extract USER_SESSION cookie from Set-Cookie headers
     */
    private extractSessionCookie(setCookieHeaders: string[]): string | null {
        for (const header of setCookieHeaders) {
            if (header.startsWith('USER_SESSION=')) {
                // Extract just the cookie name=value part (before the first semicolon)
                const cookieValue = header.split(';')[0];
                return cookieValue;
            }
        }
        return null;
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
     * Create axios instance with authentication
     * Useful for other services that need authenticated requests
     */
    createAuthenticatedClient() {
        return axios.create({
            baseURL: this.workerUrl,
            headers: this.sessionCookie ? {
                'Cookie': this.sessionCookie,
            } : {},
        });
    }
}
