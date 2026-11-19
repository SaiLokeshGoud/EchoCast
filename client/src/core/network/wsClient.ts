import {
  WsMessage,
  WsMessageType,
  DeviceRegistrationPayload,
  DeviceStateUpdatePayload,
} from '@echocast/shared';
import { timeSync } from '../sync/timeSync';

export type WsConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';
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
  private messageHandlers: Map<WsMessageType, Set<MessageHandler>> = new Map();
  private statusHandlers: Set<StatusChangeHandler> = new Set();

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
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.setStatus(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

    try {
      this.socket = new WebSocket(this.serverUrl);

      this.socket.onopen = () => {
        this.reconnectAttempts = 0;
        this.setStatus('connected');
        this.startInitialSyncBurst();
        this.startPeriodicSync();
      };

      this.socket.onmessage = (event) => {
        try {
          const message: WsMessage = JSON.parse(event.data);
          this.handleIncomingMessage(message);
        } catch (err) {
          console.error('Failed to parse incoming WebSocket message', err);
        }
      };

      this.socket.onclose = () => {
        this.cleanupSocket();
        this.setStatus('disconnected');
        this.scheduleReconnect();
      };

      this.socket.onerror = (err) => {
        console.warn('WebSocket connection error:', err);
      };
    } catch (e) {
      console.error('Failed to instantiate WebSocket:', e);
      this.scheduleReconnect();
    }
  }

  public disconnect() {
    this.reconnectAttempts = 0;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.syncTimer) clearInterval(this.syncTimer);
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
        this.socket.close();
      }
      this.socket = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), this.maxReconnectDelayMs);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private handleIncomingMessage(message: WsMessage) {
    if (message.type === 'DEVICE_REGISTERED') {
      this.deviceId = message.payload.id;
      try {
        localStorage.setItem('echocast_device_id', message.payload.id);
      } catch {
        // Ignore
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
      if (this.status !== 'connected' || count >= maxBurst) {
        clearInterval(interval);
        return;
      }
      this.sendPing();
      count++;
    }, 100);
  }

  /**
   * Maintain periodic clock synchronization to account for oscillator drift
   */
  private startPeriodicSync() {
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.syncTimer = setInterval(() => {
      if (this.status === 'connected') {
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
