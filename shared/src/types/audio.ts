/**
 * Audio streaming, metadata, and playback state types
 */

export type AudioSourceType = 'file' | 'stream' | 'tone' | 'mic';

export type AudioFormat = 'mp3' | 'wav' | 'ogg' | 'aac' | 'flac' | 'weba' | 'pcm' | 'm4a' | 'opus';

export interface AudioTrackMetadata {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  durationSec: number;
  url: string;                 // HTTP streaming URL e.g. /api/audio/stream/:id
  sourceType: AudioSourceType;
  format: AudioFormat;
  sizeBytes?: number;
  sampleRate?: number;
  channels?: number;
  addedAt: number;
  albumArtUrl?: string;
  bitrateKbps?: number;
}

export type PlaybackState = 'idle' | 'buffering' | 'ready' | 'playing' | 'paused' | 'stopped';

export interface BroadcastState {
  currentTrack: AudioTrackMetadata | null;
  playbackState: PlaybackState;
  isPlaying: boolean;
  positionSec: number;           // Track position at referenceServerTime
  referenceServerTime: number;   // Server clock timestamp when positionSec was captured
  scheduledStartTime?: number;   // Server timestamp when next play/seek takes effect
  volume: number;                // Master volume 0.0 to 1.0
  loop: boolean;
  autoplay: boolean;
  playlist: AudioTrackMetadata[];
  isRoomActive: boolean;
  roomId: string;
  authToken?: string;
  requireAuth?: boolean;
  generation: number;            // Monotonically increasing sequence to ignore stale actions
}

export interface PlayCommandPayload {
  trackId: string;
  scheduledServerTime: number;
  startPositionSec: number;
  generation: number;
  delayMs?: number;
}

export interface PauseCommandPayload {
  scheduledServerTime: number;
  pausePositionSec: number;
  generation: number;
}

export interface SeekCommandPayload {
  trackId: string;
  scheduledServerTime: number;
  targetPositionSec: number;
  generation: number;
  delayMs?: number;
}

export interface VolumeCommandPayload {
  volume: number; // 0.0 to 1.0
}
