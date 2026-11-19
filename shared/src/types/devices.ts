/**
 * Device metadata and state representations
 */

import { SyncQuality } from './sync';

export type DeviceRole = 'sender' | 'receiver';

export type DevicePlatform = 'android' | 'ios' | 'windows' | 'macos' | 'linux' | 'other';

export type DeviceAudioOutput = 'speaker' | 'bluetooth' | 'headphones' | 'unknown';

export type DeviceStatus =
  | 'connected'
  | 'syncing'
  | 'ready'
  | 'buffering'
  | 'playing'
  | 'paused'
  | 'error'
  | 'disconnected';

export interface DeviceInfo {
  id: string;
  name: string;
  role: DeviceRole;
  platform: DevicePlatform;
  outputType: DeviceAudioOutput;
  status: DeviceStatus;
  roundTripTimeMs: number;
  clockOffsetMs: number;
  jitterMs?: number;
  manualAdjustmentMs: number;
  effectiveLatencyMs?: number;
  syncErrorMs?: number;          // Live measured playback deviation vs host in ms (negative = lagging, positive = leading)
  playbackPositionSec?: number;  // Current playback timestamp in seconds
  bufferHealth?: 'good' | 'buffering' | 'underrun';
  bufferProgress?: number;       // 0 to 100
  syncQuality?: SyncQuality;
  volume: number; // 0.0 to 1.0
  isMuted: boolean;
  batteryPercent?: number;
  connectedAt: number;
  lastPingAt: number;
  ipAddress?: string;
  userAgent?: string;
  audioBufferReady?: boolean;
  roomId?: string;
  authToken?: string;
}

export interface DeviceRegistrationPayload {
  deviceId?: string;
  name: string;
  role: DeviceRole;
  platform: DevicePlatform;
  outputType: DeviceAudioOutput;
  userAgent?: string;
  roomId?: string;
  authToken?: string;
}

export interface DeviceStateUpdatePayload {
  name?: string;
  status?: DeviceStatus;
  outputType?: DeviceAudioOutput;
  roundTripTimeMs?: number;
  clockOffsetMs?: number;
  jitterMs?: number;
  manualAdjustmentMs?: number;
  effectiveLatencyMs?: number;
  syncErrorMs?: number;
  playbackPositionSec?: number;
  bufferHealth?: 'good' | 'buffering' | 'underrun';
  bufferProgress?: number;
  syncQuality?: SyncQuality;
  volume?: number;
  isMuted?: boolean;
  batteryPercent?: number;
  audioBufferReady?: boolean;
  roomId?: string;
}
