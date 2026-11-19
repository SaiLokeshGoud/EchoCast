import { SyncPingPayload, SyncPongPayload, BroadcastState } from '@echocast/shared';
import { logger } from '../utils/logger';

const syncLogger = logger.forContext('SyncEngine');

export class SyncEngineService {
  private epochAnchor: number;
  private hrAnchor: bigint;

  constructor() {
    this.epochAnchor = Date.now();
    this.hrAnchor = process.hrtime.bigint();
    syncLogger.info(`SyncEngine initialized. Epoch anchor: ${this.epochAnchor}`);
  }

  /**
   * Returns current high-precision monotonic server timestamp in milliseconds
   */
  public getServerTime(): number {
    const elapsedNs = process.hrtime.bigint() - this.hrAnchor;
    const elapsedMs = Number(elapsedNs) / 1_000_000;
    return this.epochAnchor + elapsedMs;
  }

  /**
   * Process a client NTP ping and produce the pong payload
   */
  public processPing(payload: SyncPingPayload): SyncPongPayload {
    const serverReceiveTime = this.getServerTime();
    const serverSendTime = this.getServerTime();

    return {
      clientTime: payload.clientTime,
      serverReceiveTime,
      serverSendTime,
    };
  }

  /**
   * Calculate future scheduled server time with safety broadcast window
   */
  public calculateScheduledTime(delayMs: number = 650): number {
    return this.getServerTime() + delayMs;
  }

  /**
   * Calculate expected playback position in seconds at a given server timestamp
   */
  public getExpectedPlaybackPosition(broadcastState: BroadcastState, targetServerTime?: number): number {
    if (!broadcastState.isPlaying || !broadcastState.currentTrack) {
      return broadcastState.positionSec;
    }
    const now = targetServerTime !== undefined ? targetServerTime : this.getServerTime();
    const elapsedSec = Math.max(0, (now - broadcastState.referenceServerTime) / 1000);
    let pos = broadcastState.positionSec + elapsedSec;

    if (broadcastState.currentTrack.durationSec > 0) {
      if (broadcastState.loop) {
        pos = pos % broadcastState.currentTrack.durationSec;
      } else {
        pos = Math.min(pos, broadcastState.currentTrack.durationSec);
      }
    }
    return pos;
  }

  /**
   * Calculate synchronization error in milliseconds (positive = receiver leading, negative = receiver lagging)
   */
  public calculateSyncDeviationMs(reportedPosSec: number, expectedPosSec: number): number {
    return (reportedPosSec - expectedPosSec) * 1000;
  }
}

export const syncEngine = new SyncEngineService();
