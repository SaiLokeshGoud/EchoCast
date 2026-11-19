import {
  WsMessage,
  WsMessageType,
  DeviceRegistrationPayload,
  DeviceStateUpdatePayload,
} from '@echocast/shared';
import { timeSync } from '../sync/timeSync';

export type WsConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'recovering' | 'disconnected';
export type MessageHandler<T = any> = (payload: T, message: WsMessage) => void;
export type StatusChangeHandler = (status: WsConnectionStatus) => void;

export class EchoCastWsClient {
  private socket: WebSocket | null = null;
  private serverUrl: string = '';
  private deviceId: string | null = null;
  private status: WsConnectionStatus = 'disconnected';
  private reconnectAttempts: number = 0;
  private maxReconnectDelayMs: number = 8000;
  private reconnectTimer: any = null;
  private syncTimer: any = null;
  private lastMessageReceivedAt: number = 0;
  private messageHandlers: Map<WsMessageType, Set<MessageHandler>> = new Map();
  private statusHandlers: Set<StatusChangeHandler> = new Set();
  private isExplicitlyDisconnected: boolean = false;

  constructor() {
    this.serverUrl = this.resolveDefaultWsUrl();
    try {
      this.deviceId = localStorage.getItem('echocast_device_id');
    } catch {
      // Ignore storage errors in restricted contexts
    }

    timeSync.onNeedsCalibration(() => {
      if (this.status === 'connected') {
        this.startInitialSyncBurst();
      }
    });

    this.setupLifecycleListeners();
  }

  /**
   * Browser & Mobile OS Lifecycle Event Handlers
   * Detects Safari sleep, tab switching, and local network changes.
   */
  private setupLifecycleListeners() {
    if (typeof window === 'undefined') return;

    // 1. Network Online / Offline Detection
    window.addEventListener('online', () => {
      console.log('[EchoCast WS] Browser reported network online.');
      if (!this.isExplicitlyDisconnected && this.status !== 'connected') {
        this.reconnectAttempts = 0;
        this.connect();
      } else if (this.status === 'connected') {
        // Send a probe ping to verify LAN reachability
        this.sendPing();
      }
    });

    window.addEventListener('offline', () => {
      console.log('[EchoCast WS] Browser reported network offline.');
      if (!this.isExplicitlyDisconnected) {
        this.setStatus('disconnected');
      }
    });

    // 2. Visibility Change: iOS Safari tab switch or screen unlock
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          console.log('[EchoCast WS] App returned to foreground (visible). Revalidating connection...');
          this.revalidateConnection();
        }
      });
    }

    // 3. Page Show (bfcache restoration & navigation)
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) {
        console.log('[EchoCast WS] Page restored from bfcache. Revalidating connection...');
      }
      this.revalidateConnection();
    });
  }

  /**
   * Revalidates socket health when browser wakes from sleep or background.
   */
  public revalidateConnection() {
    if (this.isExplicitlyDisconnected) return;

    if (!this.socket || this.socket.readyState === WebSocket.CLOSED || this.socket.readyState === WebSocket.CLOSING) {
      console.log('[EchoCast WS] Socket is dead/closed upon wake. Reconnecting immediately.');
      this.reconnectAttempts = 0;
      this.connect();
      return;
    }

    if (this.socket.readyState === WebSocket.OPEN) {
      // Check if connection has been silent for too long
      const silentMs = Date.now() - this.lastMessageReceivedAt;
      if (silentMs > 25000 && this.lastMessageReceivedAt > 0) {
        console.warn(`[EchoCast WS] Stalled connection detected on wake (${silentMs}ms silent). Restarting socket.`);
        this.cleanupSocket();
        this.reconnectAttempts = 0;
        this.connect();
        return;
      }

      // Socket is open, send an immediate ping burst to verify responsiveness
      this.sendPing();
    }
  }

  private resolveDefaultWsUrl(): string {
    const loc = window.location;
    const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    // If in dev mode on port 3000, Vite proxies /ws to 4000
    return `${protocol}//${loc.host}/ws`;
  }

  public setServerUrl(url: string) {
    if (url !== this.serverUrl) {
      this.serverUrl = url;
      this.disconnect();
      this.connect();
    }
  }

  public getServerUrl(): string {
    return this.serverUrl;
  }

  public getStatus(): WsConnectionStatus {
    return this.status;
  }

  public getDeviceId(): string | undefined {
    return this.deviceId || undefined;
  }

  public onStatusChange(handler: StatusChangeHandler): () => void {
    this.statusHandlers.add(handler);
    handler(this.status);
    return () => this.statusHandlers.delete(handler);
  }

  private setStatus(newStatus: WsConnectionStatus) {
    if (this.status !== newStatus) {
      this.status = newStatus;
      for (const h of this.statusHandlers) {
        try {
          h(newStatus);
        } catch (e) {
          console.error('Error in status change handler', e);
        }
      }
    }
  }

  public on<T = any>(type: WsMessageType, handler: MessageHandler<T>): () => void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, new Set());
    }
    const handlers = this.messageHandlers.get(type)!;
    handlers.add(handler as MessageHandler);
    return () => handlers.delete(handler as MessageHandler);
  }

  public connect() {
    this.isExplicitlyDisconnected = false;

    // Cancel any pending reconnect timer so we don't double-connect
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.setStatus(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

    try {
      this.socket = new WebSocket(this.serverUrl);

      this.socket.onopen = () => {
        this.lastMessageReceivedAt = Date.now();
        // Transition to 'recovering' until server acknowledges room registration
        this.setStatus(this.reconnectAttempts > 0 ? 'recovering' : 'connecting');
        this.startInitialSyncBurst();
        this.startPeriodicSync();
      };

      this.socket.onmessage = (event) => {
        this.lastMessageReceivedAt = Date.now();
        try {
          const message: WsMessage = JSON.parse(event.data);
          this.handleIncomingMessage(message);
        } catch (err) {
          console.error('Failed to parse incoming WebSocket message', err);
        }
      };

      this.socket.onclose = () => {
        this.cleanupSocket();
        if (!this.isExplicitlyDisconnected) {
          this.setStatus('reconnecting');
          this.scheduleReconnect();
        } else {
          this.setStatus('disconnected');
        }
      };

      this.socket.onerror = (err) => {
        console.warn('WebSocket connection error:', err);
      };
    } catch (e) {
      console.error('Failed to instantiate WebSocket:', e);
      if (!this.isExplicitlyDisconnected) {
        this.scheduleReconnect();
      }
    }
  }

  public disconnect() {
    this.isExplicitlyDisconnected = true;
    this.reconnectAttempts = 0;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    this.cleanupSocket();
    this.setStatus('disconnected');
  }

  private cleanupSocket() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onclose = null;
      this.socket.onerror = null;
      this.socket.onmessage = null;
      if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
        try {
          this.socket.close();
        } catch {}
      }
      this.socket = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    // Exponential backoff with random jitter to prevent thundering herd
    const baseDelay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), this.maxReconnectDelayMs);
    const jitter = Math.random() * 500;
    const delay = Math.round(baseDelay + jitter);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private handleIncomingMessage(message: WsMessage) {
    if (message.type === 'DEVICE_REGISTERED') {
      this.deviceId = message.payload.id;
      this.reconnectAttempts = 0;
      // Connection and room membership confirmed by server
      this.setStatus('connected');
      try {
        localStorage.setItem('echocast_device_id', message.payload.id);
      } catch {
        // Ignore storage errors in private browsing / sandboxes
      }
    }

    if (message.type === 'SYNC_PONG') {
      const pong = message.payload;
      const receiveTime = timeSync.getLocalTime();
      timeSync.recordSample(pong.clientTime, pong.serverReceiveTime, pong.serverSendTime, receiveTime);
    }

    const handlers = this.messageHandlers.get(message.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(message.payload, message);
        } catch (e) {
          console.error(`Error in handler for ${message.type}`, e);
        }
      }
    }
  }

  public send(message: WsMessage) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  /**
   * Send single NTP ping
   */
  public sendPing(deviceId: string = 'client') {
    const clientTime = timeSync.getLocalTime();
    this.send({
      type: 'SYNC_PING',
      payload: { clientTime, deviceId },
      timestamp: clientTime,
    });
  }

  /**
   * Run burst NTP synchronization on connection to establish accurate clock offset
   */
  public startInitialSyncBurst() {
    let count = 0;
    const maxBurst = 10;
    const interval = setInterval(() => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN || count >= maxBurst) {
        clearInterval(interval);
        return;
      }
      this.sendPing();
      count++;
    }, 100);
  }

  /**
   * Maintain periodic clock synchronization and detect zombie / stalled connections
   */
  private startPeriodicSync() {
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.syncTimer = setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        const timeSinceLastMessage = Date.now() - this.lastMessageReceivedAt;
        // If connection has been silent for > 25 seconds while open, socket is likely stalled
        if (timeSinceLastMessage > 25000 && this.lastMessageReceivedAt > 0) {
          console.warn(`[EchoCast WS] Stalled socket detected (${timeSinceLastMessage}ms silent). Recovering connection.`);
          this.cleanupSocket();
          this.scheduleReconnect();
          return;
        }

        this.sendPing();
      }
    }, 4500);
  }

  public register(payload: DeviceRegistrationPayload) {
    if (!payload.deviceId && this.deviceId) {
      payload.deviceId = this.deviceId;
    }
    this.send({
      type: 'DEVICE_REGISTER',
      payload,
      timestamp: timeSync.getLocalTime(),
    });
  }

  public updateDeviceState(payload: DeviceStateUpdatePayload) {
    this.send({
      type: 'DEVICE_STATE_UPDATE',
      payload,
      timestamp: timeSync.getLocalTime(),
    });
  }
}

export const wsClient = new EchoCastWsClient();
