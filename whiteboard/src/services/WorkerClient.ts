import { ExcalidrawWorkerClient, type WorkerLogger, type ConnectedClientsUpdateMessage } from '../../../shared-api-client/index';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

class InMemoryLogger implements WorkerLogger {
  private listeners = new Set<(level: string, args: any[]) => void>();
  on(cb: (level: string, args: any[]) => void) { this.listeners.add(cb); }
  off(cb: (level: string, args: any[]) => void) { this.listeners.delete(cb); }
  private emit(level: string, ...args: any[]) { this.listeners.forEach(l => l(level, args)); }
  debug(...args: any[]) { this.emit('debug', ...args); }
  info(...args: any[]) { this.emit('info', ...args); }
  warn(...args: any[]) { this.emit('warn', ...args); }
  error(...args: any[]) { this.emit('error', ...args); }
}

export interface AuthState {
  userId: string | null;
  username: string | null;
}

class WorkerClientService {
  private client: ExcalidrawWorkerClient;
  private logger = new InMemoryLogger();
  private connectedClients: ConnectedClientsUpdateMessage | null = null;
  private connectionState: ConnectionState = 'disconnected';
  private auth: AuthState = { userId: null, username: null };

  private ccListeners = new Set<(msg: ConnectedClientsUpdateMessage) => void>();
  private connListeners = new Set<(state: ConnectionState) => void>();
  private errListeners = new Set<(error: Error) => void>();

  constructor(workerUrl: string) {
    this.client = new ExcalidrawWorkerClient(workerUrl);
    this.client.setLogger(this.logger);
    this.client.onConnectedClientsUpdate((msg) => {
      this.connectedClients = msg;
      this.ccListeners.forEach(cb => cb(msg));
    });
    this.client.onConnect(() => {
      this.setConnectionState('connected');
    });
    this.client.onDisconnect(() => {
      this.setConnectionState('disconnected');
    });
    this.client.onError((e) => {
      this.setConnectionState('error');
      this.errListeners.forEach(cb => cb(e));
    });
  }

  onLog(cb: (level: string, args: any[]) => void) { this.logger.on(cb); }
  offLog(cb: (level: string, args: any[]) => void) { this.logger.off(cb); }

  onConnectedClients(cb: (msg: ConnectedClientsUpdateMessage) => void) { this.ccListeners.add(cb); }
  offConnectedClients(cb: (msg: ConnectedClientsUpdateMessage) => void) { this.ccListeners.delete(cb); }

  onConnectionState(cb: (state: ConnectionState) => void) { this.connListeners.add(cb); }
  offConnectionState(cb: (state: ConnectionState) => void) { this.connListeners.delete(cb); }

  onError(cb: (error: Error) => void) { this.errListeners.add(cb); }
  offError(cb: (error: Error) => void) { this.errListeners.delete(cb); }

  getConnectedClients() { return this.connectedClients; }
  getConnectionState() { return this.connectionState; }
  getAuth() { return this.auth; }

  private setConnectionState(state: ConnectionState) {
    this.connectionState = state;
    this.connListeners.forEach(cb => cb(state));
  }

  async register(username: string, password: string) {
    const data = await this.client.register(username, password);
    this.auth = { userId: data.userId, username };
    return data;
  }

  async login(username: string, password: string) {
    const data = await this.client.login(username, password);
    this.auth = { userId: data.userId, username };
    return data;
  }

  async connect() {
    this.setConnectionState('connecting');
    await this.client.connectAs('excalidraw');
  }

  updateWhiteboard(componentId: string, elements: any[], screenshot?: string) {
    this.client.updateWhiteboard(componentId, elements as any, screenshot);
  }
}

// Default worker URL with env override
const DEFAULT_WORKER_URL = (globalThis as any).WORKER_URL || (import.meta as any).env?.VITE_WORKER_URL || 'ws://localhost:5353';

export const WorkerClient = new WorkerClientService(DEFAULT_WORKER_URL);
