import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'crypto';
import {
  WsMessage,
  WsMessageType,
  DeviceInfo,
} from '@echocast/shared';
import { logger } from '../utils/logger';
import { deviceManager } from '../services/deviceManagerService';
import { syncEngine } from '../services/syncEngineService';
import { audioStreamService } from '../services/audioStreamService';
import { config } from '../config/index';

const wsLogger = logger.forContext('WsServer');

interface ExtendedWebSocket extends WebSocket {
  deviceId?: string;
  isAlive: boolean;
  ipAddress?: string;
}

export class EchoCastWsServer {
  private wss: WebSocketServer | null = null;
  private clientSockets: Map<string, ExtendedWebSocket> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  public initialize(server: HttpServer) {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws: ExtendedWebSocket, req) => {
      const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
      ws.ipAddress = ip.replace(/^.*:/, ''); // Strip IPv6 prefix if IPv4 mapped
      ws.isAlive = true;

      // Temporary ID until registration
      const tempId = crypto.randomUUID();
      ws.deviceId = tempId;
      this.clientSockets.set(tempId, ws);

      wsLogger.info(`New WebSocket client connected from ${ws.ipAddress} (tempId: ${tempId})`);

      ws.on('pong', () => {
        ws.isAlive = true;
      });

      ws.on('message', (data) => {
        try {
          const raw = data.toString();
          const message: WsMessage = JSON.parse(raw);
          this.handleMessage(ws, message);
        } catch (err) {
          wsLogger.error('Failed to parse incoming WebSocket message', err);
          this.sendError(ws, 'BAD_PAYLOAD', 'Invalid JSON message payload');
        }
      });

      ws.on('close', () => {
        if (ws.deviceId) {
          this.clientSockets.delete(ws.deviceId);
          deviceManager.removeDevice(ws.deviceId);
          wsLogger.info(`Client disconnected: ${ws.deviceId}`);
        }
      });

      ws.on('error', (err) => {
        wsLogger.error(`WebSocket error on client ${ws.deviceId}`, err);
      });
    });

    // Device roster subscription: broadcast updated device list whenever changes occur
    deviceManager.subscribe((devices) => {
      this.broadcast({
        type: 'DEVICE_LIST',
        payload: devices,
        timestamp: syncEngine.getServerTime(),
      });
    });

    // Start heartbeat interval to reap dead connections
    this.heartbeatInterval = setInterval(() => {
      if (!this.wss) return;
      for (const [deviceId, ws] of this.clientSockets.entries()) {
        if (!ws.isAlive) {
          wsLogger.warn(`Client ${deviceId} timed out, terminating.`);
          ws.terminate();
          this.clientSockets.delete(deviceId);
          deviceManager.removeDevice(deviceId);
          continue;
        }
        ws.isAlive = false;
        ws.ping();
      }
    }, config.heartbeatIntervalMs);

    wsLogger.info('WebSocket Server initialized on /ws');
  }

  private handleMessage(ws: ExtendedWebSocket, message: WsMessage) {
    const serverTimestamp = syncEngine.getServerTime();

    switch (message.type) {
      case 'DEVICE_REGISTER': {
        const payload = message.payload;
        // Use existing deviceId or generate consistent client id
        const deviceId = ws.deviceId || crypto.randomUUID();
        ws.deviceId = deviceId;
        this.clientSockets.set(deviceId, ws);

        const registeredDevice = deviceManager.registerDevice(deviceId, payload, ws.ipAddress);

        // Acknowledge registration
        this.send(ws, {
          type: 'DEVICE_REGISTERED',
          payload: registeredDevice,
          timestamp: serverTimestamp,
        });

        // Send current broadcast state to new device
        this.send(ws, {
          type: 'BROADCAST_STATE',
          payload: audioStreamService.getBroadcastState(),
          timestamp: serverTimestamp,
        });

        // Send current device list
        this.send(ws, {
          type: 'DEVICE_LIST',
          payload: deviceManager.getAllDevices(),
          timestamp: serverTimestamp,
        });
        break;
      }

      case 'DEVICE_STATE_UPDATE': {
        if (ws.deviceId) {
          deviceManager.updateDeviceState(ws.deviceId, message.payload);
        }
        break;
      }

      case 'SYNC_PING': {
        const pong = syncEngine.processPing(message.payload);
        this.send(ws, {
          type: 'SYNC_PONG',
          payload: pong,
          timestamp: pong.serverSendTime,
        });
        if (ws.deviceId) {
          deviceManager.recordPing(ws.deviceId);
        }
        break;
      }

      case 'BROADCAST_TRACK_UPDATE': {
        if (message.payload?.id) {
          const track = audioStreamService.setTrack(message.payload.id);
          if (track) {
            this.broadcast({
              type: 'BROADCAST_TRACK_UPDATE',
              payload: track,
              timestamp: serverTimestamp,
            });
            this.broadcast({
              type: 'BROADCAST_STATE',
              payload: audioStreamService.getBroadcastState(),
              timestamp: serverTimestamp,
            });
          }
        }
        break;
      }

      case 'BROADCAST_PLAY': {
        const startPos = message.payload?.startPositionSec;
        const playResult = audioStreamService.play(startPos);
        if (playResult) {
          this.broadcast({
            type: 'BROADCAST_PLAY',
            payload: playResult,
            timestamp: serverTimestamp,
          });
          this.broadcast({
            type: 'BROADCAST_STATE',
            payload: audioStreamService.getBroadcastState(),
            timestamp: serverTimestamp,
          });
        }
        break;
      }

      case 'BROADCAST_PAUSE': {
        const pauseResult = audioStreamService.pause();
        if (pauseResult) {
          this.broadcast({
            type: 'BROADCAST_PAUSE',
            payload: pauseResult,
            timestamp: serverTimestamp,
          });
          this.broadcast({
            type: 'BROADCAST_STATE',
            payload: audioStreamService.getBroadcastState(),
            timestamp: serverTimestamp,
          });
        }
        break;
      }

      case 'BROADCAST_SEEK': {
        const seekResult = audioStreamService.seek(message.payload.targetPositionSec);
        if (seekResult) {
          this.broadcast({
            type: 'BROADCAST_SEEK',
            payload: seekResult,
            timestamp: serverTimestamp,
          });
          this.broadcast({
            type: 'BROADCAST_STATE',
            payload: audioStreamService.getBroadcastState(),
            timestamp: serverTimestamp,
          });
        }
        break;
      }

      case 'BROADCAST_STOP': {
        const gen = audioStreamService.stop();
        this.broadcast({
          type: 'BROADCAST_STOP',
          payload: { generation: gen },
          timestamp: serverTimestamp,
        });
        this.broadcast({
          type: 'BROADCAST_STATE',
          payload: audioStreamService.getBroadcastState(),
          timestamp: serverTimestamp,
        });
        break;
      }

      case 'BROADCAST_VOLUME': {
        audioStreamService.setVolume(message.payload.volume);
        this.broadcast({
          type: 'BROADCAST_VOLUME',
          payload: message.payload,
          timestamp: serverTimestamp,
        });
        break;
      }

      case 'BROADCAST_PLAYLIST_UPDATE': {
        const { playlist } = message.payload;
        if (Array.isArray(playlist)) {
          audioStreamService.setPlaylistOrder(playlist.map((t) => t.id));
          this.broadcast({
            type: 'BROADCAST_STATE',
            payload: audioStreamService.getBroadcastState(),
            timestamp: serverTimestamp,
          });
        }
        break;
      }

      case 'BROADCAST_AUTOPLAY_UPDATE': {
        audioStreamService.setAutoplay(message.payload.autoplay);
        this.broadcast({
          type: 'BROADCAST_STATE',
          payload: audioStreamService.getBroadcastState(),
          timestamp: serverTimestamp,
        });
        break;
      }

      case 'BROADCAST_ROOM_UPDATE': {
        const { isRoomActive, roomId } = message.payload;
        audioStreamService.setRoomState(isRoomActive, roomId);
        this.broadcast({
          type: 'BROADCAST_ROOM_UPDATE',
          payload: { isRoomActive, roomId },
          timestamp: serverTimestamp,
        });
        this.broadcast({
          type: 'BROADCAST_STATE',
          payload: audioStreamService.getBroadcastState(),
          timestamp: serverTimestamp,
        });
        break;
      }

      case 'TRACK_DELETE': {
        const { trackId } = message.payload;
        audioStreamService.removeTrack(trackId);
        this.broadcast({
          type: 'BROADCAST_STATE',
          payload: audioStreamService.getBroadcastState(),
          timestamp: serverTimestamp,
        });
        break;
      }

      case 'TRACK_UPDATE_METADATA': {
        const { trackId, durationSec, artist, album } = message.payload;
        audioStreamService.updateTrackMetadata(trackId, durationSec, artist, album);
        this.broadcast({
          type: 'BROADCAST_STATE',
          payload: audioStreamService.getBroadcastState(),
          timestamp: serverTimestamp,
        });
        break;
      }

      case 'TEST_PULSE_PLAY': {
        // Scheduled synchronization test blip (1kHz 60ms click) across all receivers
        const scheduledTime = syncEngine.calculateScheduledTime(400);
        this.broadcast({
          type: 'TEST_PULSE_PLAY',
          payload: {
            scheduledServerTime: scheduledTime,
            frequencyHz: message.payload.frequencyHz || 1000,
            durationMs: message.payload.durationMs || 60,
          },
          timestamp: serverTimestamp,
        });
        break;
      }

      case 'REMOTE_SET_RECEIVER_VOLUME': {
        const { targetDeviceId, volume } = message.payload;
        deviceManager.updateDeviceState(targetDeviceId, { volume });
        const targetSocket = this.clientSockets.get(targetDeviceId);
        if (targetSocket) {
          this.send(targetSocket, {
            type: 'REMOTE_SET_RECEIVER_VOLUME',
            payload: { targetDeviceId, volume },
            timestamp: serverTimestamp,
          });
        }
        break;
      }

      case 'REMOTE_MUTE_RECEIVER': {
        const { targetDeviceId, isMuted } = message.payload;
        deviceManager.updateDeviceState(targetDeviceId, { isMuted });
        const targetSocket = this.clientSockets.get(targetDeviceId);
        if (targetSocket) {
          this.send(targetSocket, {
            type: 'REMOTE_MUTE_RECEIVER',
            payload: { targetDeviceId, isMuted },
            timestamp: serverTimestamp,
          });
        }
        break;
      }

      case 'REMOTE_DISCONNECT_RECEIVER': {
        const { targetDeviceId, reason } = message.payload;
        const targetSocket = this.clientSockets.get(targetDeviceId);
        if (targetSocket) {
          this.send(targetSocket, {
            type: 'REMOTE_DISCONNECT_RECEIVER',
            payload: { targetDeviceId, reason: reason || 'Disconnected by host' },
            timestamp: serverTimestamp,
          });
          setTimeout(() => {
            targetSocket.terminate();
            this.clientSockets.delete(targetDeviceId);
            deviceManager.removeDevice(targetDeviceId);
          }, 100);
        } else {
          deviceManager.removeDevice(targetDeviceId);
        }
        break;
      }

      default:
        wsLogger.warn(`Unhandled message type: ${(message as any).type}`);
    }
  }

  public send(ws: WebSocket, message: WsMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  public sendTo(deviceId: string, message: WsMessage): boolean {
    const socket = this.clientSockets.get(deviceId);
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  public broadcast(message: WsMessage) {
    const serialized = JSON.stringify(message);
    if (!this.wss) return;
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(serialized);
      }
    }
  }

  private sendError(ws: WebSocket, code: string, message: string) {
    this.send(ws, {
      type: 'ERROR',
      payload: { code, message },
      timestamp: syncEngine.getServerTime(),
    });
  }

  public close() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.wss) {
      this.wss.close();
    }
  }
}

export const wsServer = new EchoCastWsServer();
