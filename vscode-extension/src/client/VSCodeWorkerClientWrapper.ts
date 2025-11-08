import { VSCodeWorkerClient as SharedVSCodeWorkerClient } from 'shared-api-client';
import axios from 'axios';

/**
 * VSCode-specific wrapper for the shared API client
 * Handles Node.js-specific requirements (fetch polyfill, etc.)
 */
export class VSCodeWorkerClient extends SharedVSCodeWorkerClient {
    /**
     * Override authenticate to use axios in Node.js environment
     * since fetch might not be available in older Node versions
     */
    async authenticate(username: string, password: string): Promise<string> {
        // Get workerUrl from parent (it's private, so we access it via any)
        const workerUrl = (this as any).workerUrl as string;
        const authUrl = `${workerUrl.replace('ws://', 'http://').replace('wss://', 'https://')}/auth`;
        const credentials = Buffer.from(`${username}:${password}`).toString('base64');

        const response = await axios.post(authUrl, {}, {
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/json',
            },
        });

        const data = response.data;
        if (!data || typeof data.sessionToken !== 'string') {
            throw new Error('Invalid authentication response: missing sessionToken');
        }
        
        // Set the session token in the parent class
        // Since it's private, we access it directly and then use connectWithToken
        (this as any).sessionToken = data.sessionToken;
        
        return data.sessionToken;
    }
}

