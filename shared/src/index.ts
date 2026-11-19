export * from './types/devices';
export * from './types/sync';
export * from './types/audio';
export * from './types/network';
export * from './types/messages';

/**
 * Format milliseconds to readable string
 */
export function formatTimeMs(ms: number): string {
  if (Math.abs(ms) < 1) return `${(ms * 1000).toFixed(0)}µs`;
  if (Math.abs(ms) < 1000) return `${ms.toFixed(1)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Format track seconds into MM:SS
 */
export function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Helper to determine sync quality classification
 */
export function evaluateSyncQuality(offsetMs: number, rttMs: number): 'excellent' | 'good' | 'fair' | 'poor' {
  const absOffset = Math.abs(offsetMs);
  if (absOffset <= 5 && rttMs <= 25) return 'excellent';
  if (absOffset <= 15 && rttMs <= 60) return 'good';
  if (absOffset <= 35 && rttMs <= 120) return 'fair';
  return 'poor';
}

/**
 * Audio format MIME type mapping
 */
export const AUDIO_MIME_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  aac: 'audio/aac',
  flac: 'audio/flac',
  weba: 'audio/webm',
  m4a: 'audio/mp4',
  opus: 'audio/opus',
  pcm: 'audio/wav',
};
