/**
 * Device metadata and state representations
 */

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
  manualAdjustmentMs: number;
  volume: number; // 0.0 to 1.0
  isMuted: boolean;
  batteryPercent?: number;
  connectedAt: number;
  lastPingAt: number;
  ipAddress?: string;
  userAgent?: string;
  audioBufferReady?: boolean;
}

export interface DeviceRegistrationPayload {
  name: string;
  role: DeviceRole;
  platform: DevicePlatform;
  outputType: DeviceAudioOutput;
  userAgent?: string;
}

export interface DeviceStateUpdatePayload {
  status?: DeviceStatus;
  outputType?: DeviceAudioOutput;
  roundTripTimeMs?: number;
  clockOffsetMs?: number;
  manualAdjustmentMs?: number;
  volume?: number;
  isMuted?: boolean;
  batteryPercent?: number;
  audioBufferReady?: boolean;
}
