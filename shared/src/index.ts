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
 * Calculate the authoritative current position for a broadcast timeline
 */
export function calculateTimelinePositionSec(
  timeline: import('./types/audio').BroadcastTimeline,
  currentServerTime: number
): number {
  if (timeline.state === 'playing') {
    const elapsedSec = Math.max(0, (currentServerTime - timeline.broadcastStartTime) / 1000);
    const pos = timeline.startPositionSec + elapsedSec * (timeline.playbackRate || 1.0);
    if (timeline.track && timeline.track.durationSec > 0 && pos >= timeline.track.durationSec) {
      return timeline.track.durationSec;
    }
    return Math.max(0, pos);
  }
  if (timeline.state === 'paused') {
    return Math.max(0, timeline.startPositionSec);
  }
  return 0;
}

/**
 * Helper to determine sync quality classification
 */
export function evaluateSyncQuality(offsetMs: number, rttMs: number, jitterMs: number = 0): 'excellent' | 'good' | 'fair' | 'poor' {
  const absOffset = Math.abs(offsetMs);
  if (absOffset <= 5 && rttMs <= 25 && jitterMs <= 4) return 'excellent';
  if (absOffset <= 15 && rttMs <= 60 && jitterMs <= 10) return 'good';
  if (absOffset <= 35 && rttMs <= 120 && jitterMs <= 25) return 'fair';
  return 'poor';
}

/**
 * Return user-facing acoustic sync health label and tag
 */
export function evaluateSyncHealthTag(syncErrorMs?: number): {
  label: string;
  color: string;
  badgeClass: string;
  description: string;
} {
  if (syncErrorMs === undefined) {
    return {
      label: 'Standby',
      color: 'text-slate-400',
      badgeClass: 'bg-slate-800 text-slate-400 border-slate-700',
      description: 'Waiting for playback broadcast',
    };
  }

  const absError = Math.abs(syncErrorMs);
  if (absError <= 20) {
    return {
      label: 'Phase Locked (≤20ms)',
      color: 'text-emerald-400',
      badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      description: 'Imperceptible phase alignment; identical acoustics across devices.',
    };
  }
  if (absError <= 50) {
    return {
      label: 'Tight Sync (≤50ms)',
      color: 'text-teal-400',
      badgeClass: 'bg-teal-500/10 text-teal-400 border-teal-500/30',
      description: 'High-quality synchronized playback within multi-room targets.',
    };
  }
  if (absError <= 150) {
    return {
      label: 'Audible Sync (≤150ms)',
      color: 'text-amber-400',
      badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      description: 'Acceptable sync; rate nudge actively narrowing phase offset.',
    };
  }
  return {
    label: `Drift (>150ms: ${Math.round(syncErrorMs)}ms)`,
    color: 'text-rose-400',
    badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
    description: 'Noticeable acoustic lag; hard catch-up active.',
  };
}

export interface NetworkQualityResult {
  score: number; // 0 to 100
  label: string;
  color: string;
  badgeClass: string;
  indicator: 'optimal' | 'good' | 'fair' | 'poor';
}

/**
 * Evaluate measurable local Wi-Fi / Hotspot link quality based on RTT and jitter
 */
export function evaluateNetworkQuality(rttMs: number, jitterMs: number = 0): NetworkQualityResult {
  let score = 100 - (rttMs * 0.45 + jitterMs * 1.5);
  score = Math.max(5, Math.min(100, Math.round(score)));

  if (rttMs <= 25 && jitterMs <= 6) {
    return {
      score,
      label: 'Optimal',
      color: 'text-emerald-400',
      badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      indicator: 'optimal',
    };
  }
  if (rttMs <= 60 && jitterMs <= 18) {
    return {
      score,
      label: 'Good',
      color: 'text-cyanAccent-400',
      badgeClass: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
      indicator: 'good',
    };
  }
  if (rttMs <= 120 && jitterMs <= 35) {
    return {
      score,
      label: 'Fair',
      color: 'text-amber-400',
      badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      indicator: 'fair',
    };
  }
  return {
    score,
    label: 'Congested',
    color: 'text-rose-400',
    badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
    indicator: 'poor',
  };
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
