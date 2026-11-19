/**
 * NTP-like Precision Time Protocol clock synchronization types
 */

export interface SyncPingPayload {
  clientTime: number; // t0: client timestamp when ping is sent
  deviceId: string;
}

export interface SyncPongPayload {
  clientTime: number;        // t0
  serverReceiveTime: number; // t1
  serverSendTime: number;    // t2
}

export type SyncQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'uncalibrated';

export interface SyncSample {
  roundTripTimeMs: number;
  offsetMs: number;
  timestamp: number;
}

export interface SyncMetrics {
  roundTripTimeMs: number;
  clockOffsetMs: number;
  jitterMs: number;
  quality: SyncQuality;
  samplesCount: number;
  lastSyncTimestamp: number;
  manualAdjustmentMs: number;
  hardwareOutputLatencyMs: number;
  effectiveTotalLatencyMs: number;
}

export interface ScheduledPlaybackEvent {
  scheduledServerTime: number; // Target server clock timestamp to trigger
  positionSec: number;         // Track position in seconds at the scheduled time
  generation: number;          // Unique generation number to cancel stale events
}

export interface SyncHealthMetrics {
  roundTripTimeMs: number;
  clockOffsetMs: number;
  jitterMs: number;
  syncErrorMs: number;
  driftCorrectionActive: boolean;
  driftCorrectionRate: number; // e.g. 1.015 (+1.5%), 0.985 (-1.5%), 1.0 (neutral)
  quality: SyncQuality;
  networkCondition: 'optimal' | 'stable' | 'jittery' | 'congested';
}
