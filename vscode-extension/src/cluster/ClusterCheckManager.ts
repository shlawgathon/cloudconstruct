import * as vscode from 'vscode';
import { WorkerApiClient } from '../client/WorkerApiClient';
import { VSCodeWorkerClient } from '../client/VSCodeWorkerClientWrapper';
import { StatusView } from './StatusView';
import { WSMessage, ClusterCheckResponseMessage, StatusUpdateMessage } from 'shared-api-client';

/**
 * Cluster check orchestration
 * Manages cluster status checks and updates
 */
export class ClusterCheckManager {
    constructor(
        private readonly apiClient: WorkerApiClient,
        private readonly webSocket: VSCodeWorkerClient,
        private readonly statusView: StatusView
    ) {}

    initialize(context: vscode.ExtensionContext): void {
        // Listen to WebSocket events for real-time updates
        this.webSocket.onMessage((message: WSMessage) => {
            this.handleWebSocketMessage(message);
        });

        // Set up periodic cluster checks if needed
        // Can be implemented based on requirements
    }

    private handleWebSocketMessage(message: WSMessage): void {
        switch (message.type) {
            case 'clusterCheckResponse':
                this.handleClusterCheckResponse(message as ClusterCheckResponseMessage);
                break;
            case 'statusUpdate':
                this.handleStatusUpdate(message as StatusUpdateMessage);
                break;
        }
    }

    private handleClusterCheckResponse(message: ClusterCheckResponseMessage): void {
        // Update status view with cluster check results
        vscode.window.showInformationMessage(`Cluster check: ${message.status}`);
        // Update status view tree
        this.statusView.refresh();
    }

    private handleStatusUpdate(message: StatusUpdateMessage): void {
        // Update status view with component status
        this.statusView.refresh();
    }

    async checkCluster(componentId?: string, specFile?: string): Promise<void> {
        if (!this.webSocket.getConnectionStatus()) {
            vscode.window.showErrorMessage('WebSocket not connected. Please login first.');
            return;
        }

        if (componentId && specFile) {
            // Request cluster check for specific component
            this.webSocket.requestClusterCheck(componentId, specFile);
            vscode.window.showInformationMessage('Checking cluster status...');
        } else {
            vscode.window.showInformationMessage('Checking cluster status...');
            // Generic cluster check - implement based on worker API
        }
    }
}



