import { DeviceInfo, DeviceRegistrationPayload, DeviceStateUpdatePayload } from './devices';
import { SyncPingPayload, SyncPongPayload } from './sync';
import {
  AudioTrackMetadata,
  BroadcastState,
  PlayCommandPayload,
  PauseCommandPayload,
  SeekCommandPayload,
  VolumeCommandPayload,
} from './audio';

export type WsMessageType =
  // Device Lifecycle
  | 'DEVICE_REGISTER'
  | 'DEVICE_REGISTERED'
  | 'DEVICE_LIST'
  | 'DEVICE_STATE_UPDATE'
  | 'DEVICE_DISCONNECTED'
  | 'RECEIVER_LEAVE_ROOM'

  // Time Synchronization (NTP protocol)
  | 'SYNC_PING'
  | 'SYNC_PONG'
  | 'SYNC_FORCE_CALIBRATE'

  // Broadcast & Audio Playback
  | 'BROADCAST_STATE'
  | 'BROADCAST_TRACK_UPDATE'
  | 'BROADCAST_PLAYLIST_UPDATE'
  | 'BROADCAST_AUTOPLAY_UPDATE'
  | 'BROADCAST_ROOM_UPDATE'
  | 'BROADCAST_PLAY'
  | 'BROADCAST_PAUSE'
  | 'BROADCAST_SEEK'
  | 'BROADCAST_STOP'
  | 'BROADCAST_VOLUME'

  // Track Management
  | 'TRACK_DELETE'
  | 'TRACK_UPDATE_METADATA'

  // Diagnostics & Alignment
  | 'TEST_PULSE_PLAY'

  // Remote Sender controls on specific receiver
  | 'REMOTE_SET_RECEIVER_VOLUME'
  | 'REMOTE_MUTE_RECEIVER'
  | 'REMOTE_DISCONNECT_RECEIVER'
  | 'ERROR';

export interface BaseWsMessage<T = unknown> {
  type: WsMessageType;
  payload: T;
  timestamp: number;
  senderId?: string;
}

export type WsMessage =
  | { type: 'DEVICE_REGISTER'; payload: DeviceRegistrationPayload; timestamp: number; senderId?: string }
  | { type: 'DEVICE_REGISTERED'; payload: DeviceInfo; timestamp: number; senderId?: string }
  | { type: 'DEVICE_LIST'; payload: DeviceInfo[]; timestamp: number; senderId?: string }
  | { type: 'DEVICE_STATE_UPDATE'; payload: DeviceStateUpdatePayload; timestamp: number; senderId?: string }
  | { type: 'DEVICE_DISCONNECTED'; payload: { deviceId: string }; timestamp: number; senderId?: string }
  | { type: 'RECEIVER_LEAVE_ROOM'; payload: { deviceId?: string }; timestamp: number; senderId?: string }
  | { type: 'SYNC_PING'; payload: SyncPingPayload; timestamp: number; senderId?: string }
  | { type: 'SYNC_PONG'; payload: SyncPongPayload; timestamp: number; senderId?: string }
  | { type: 'SYNC_FORCE_CALIBRATE'; payload: Record<string, never>; timestamp: number; senderId?: string }
  | { type: 'BROADCAST_STATE'; payload: BroadcastState; timestamp: number; senderId?: string }
  | { type: 'BROADCAST_TRACK_UPDATE'; payload: AudioTrackMetadata | null; timestamp: number; senderId?: string }
  | { type: 'BROADCAST_PLAYLIST_UPDATE'; payload: { playlist: AudioTrackMetadata[] }; timestamp: number; senderId?: string }
  | { type: 'BROADCAST_AUTOPLAY_UPDATE'; payload: { autoplay: boolean }; timestamp: number; senderId?: string }
  | { type: 'BROADCAST_ROOM_UPDATE'; payload: { isRoomActive: boolean; roomId: string }; timestamp: number; senderId?: string }
  | { type: 'BROADCAST_PLAY'; payload: PlayCommandPayload; timestamp: number; senderId?: string }
  | { type: 'BROADCAST_PAUSE'; payload: PauseCommandPayload; timestamp: number; senderId?: string }
  | { type: 'BROADCAST_SEEK'; payload: SeekCommandPayload; timestamp: number; senderId?: string }
  | { type: 'BROADCAST_STOP'; payload: { generation: number }; timestamp: number; senderId?: string }
  | { type: 'BROADCAST_VOLUME'; payload: VolumeCommandPayload; timestamp: number; senderId?: string }
  | { type: 'TRACK_DELETE'; payload: { trackId: string }; timestamp: number; senderId?: string }
  | { type: 'TRACK_UPDATE_METADATA'; payload: { trackId: string; durationSec: number; artist?: string; album?: string }; timestamp: number; senderId?: string }
  | { type: 'TEST_PULSE_PLAY'; payload: { scheduledServerTime: number; frequencyHz: number; durationMs: number }; timestamp: number; senderId?: string }
  | { type: 'REMOTE_SET_RECEIVER_VOLUME'; payload: { targetDeviceId: string; volume: number }; timestamp: number; senderId?: string }
  | { type: 'REMOTE_MUTE_RECEIVER'; payload: { targetDeviceId: string; isMuted: boolean }; timestamp: number; senderId?: string }
  | { type: 'REMOTE_DISCONNECT_RECEIVER'; payload: { targetDeviceId: string; reason?: string }; timestamp: number; senderId?: string }
  | { type: 'ERROR'; payload: { code: string; message: string; details?: unknown }; timestamp: number; senderId?: string };
