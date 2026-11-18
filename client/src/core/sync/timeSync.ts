import { SyncMetrics, SyncQuality, SyncSample } from '@echocast/shared';

export type SyncUpdateListener = (metrics: SyncMetrics) => void;

export class TimeSyncEngine {
  private samples: SyncSample[] = [];
  private readonly maxSamples: number = 20;
  private currentOffsetMs: number = 0;
  private currentRttMs: number = 0;
  private currentJitterMs: number = 0;
  private manualAdjustmentMs: number = 0;
  private hardwareOutputLatencyMs: number = 0;
  private lastSyncTimestamp: number = 0;
  private listeners: Set<SyncUpdateListener> = new Set();

  public subscribe(listener: SyncUpdateListener): () => void {
    this.listeners.add(listener);
    listener(this.getMetrics());
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const metrics = this.getMetrics();
    for (const listener of this.listeners) {
      try {
        listener(metrics);
      } catch (e) {
        console.error('Error in sync listener', e);
      }
    }
  }

  /**
   * Get high-precision local timestamp in milliseconds
   */
  public getLocalTime(): number {
    return performance.timeOrigin + performance.now();
  }

  /**
   * Calculate server timestamp from current local time
   * ServerTime = LocalTime + ClockOffset
   */
  public getServerTime(localTime: number = this.getLocalTime()): number {
    return localTime + this.currentOffsetMs;
  }

  /**
   * Convert server timestamp to local timestamp
   * LocalTime = ServerTime - ClockOffset
   */
  public toLocalTime(serverTime: number): number {
    return serverTime - this.currentOffsetMs;
  }

  /**
   * Process incoming NTP Pong sample
   * @param t0 Client send timestamp
   * @param t1 Server receive timestamp
   * @param t2 Server send timestamp
   * @param t3 Client receive timestamp (defaults to current local time)
   */
  public recordSample(t0: number, t1: number, t2: number, t3: number = this.getLocalTime()): SyncSample {
    const roundTripTimeMs = Math.max(0, (t3 - t0) - (t2 - t1));
    const offsetMs = ((t1 - t0) + (t2 - t3)) / 2;

    const sample: SyncSample = {
      roundTripTimeMs,
      offsetMs,
      timestamp: t3,
    };

    this.samples.push(sample);
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }

    this.recomputeOffset();
    this.lastSyncTimestamp = t3;
    this.notify();

    return sample;
  }

  /**
   * Compute filtered offset rejecting outliers using lowest RTT weighting
   */
  private recomputeOffset() {
    if (this.samples.length === 0) return;

    if (this.samples.length === 1) {
      this.currentOffsetMs = this.samples[0].offsetMs;
      this.currentRttMs = this.samples[0].roundTripTimeMs;
      this.currentJitterMs = 0;
      return;
    }

    // Sort samples by Round Trip Time
    const sortedByRtt = [...this.samples].sort((a, b) => a.roundTripTimeMs - b.roundTripTimeMs);

    // Keep the best 60% of samples (lowest RTT has minimum network queuing delay)
    const countToKeep = Math.max(1, Math.ceil(sortedByRtt.length * 0.6));
    const bestSamples = sortedByRtt.slice(0, countToKeep);

    // Weighted average: inverse RTT weighting gives highest confidence to fastest packets
    let totalWeight = 0;
    let weightedOffsetSum = 0;
    let rttSum = 0;

    for (const s of bestSamples) {
      // Avoid division by zero
      const weight = 1 / Math.max(1, s.roundTripTimeMs);
      totalWeight += weight;
      weightedOffsetSum += s.offsetMs * weight;
      rttSum += s.roundTripTimeMs;
    }

    this.currentOffsetMs = weightedOffsetSum / totalWeight;
    this.currentRttMs = rttSum / bestSamples.length;

    // Calculate jitter as standard deviation of offset in best samples
    const variance =
      bestSamples.reduce((sum, s) => sum + Math.pow(s.offsetMs - this.currentOffsetMs, 2), 0) /
      bestSamples.length;
    this.currentJitterMs = Math.sqrt(variance);
  }

  public setManualAdjustment(ms: number) {
    this.manualAdjustmentMs = ms;
    this.notify();
  }

  public setHardwareOutputLatency(ms: number) {
    this.hardwareOutputLatencyMs = ms;
    this.notify();
  }

  public getQuality(): SyncQuality {
    if (this.samples.length < 3) return 'uncalibrated';
    const absOffset = Math.abs(this.currentOffsetMs);
    if (absOffset <= 5 && this.currentRttMs <= 25) return 'excellent';
    if (absOffset <= 15 && this.currentRttMs <= 60) return 'good';
    if (absOffset <= 35 && this.currentRttMs <= 120) return 'fair';
    return 'poor';
  }

  public getMetrics(): SyncMetrics {
    const effectiveTotalLatencyMs =
      this.currentRttMs / 2 + this.hardwareOutputLatencyMs + this.manualAdjustmentMs;

    return {
      roundTripTimeMs: this.currentRttMs,
      clockOffsetMs: this.currentOffsetMs,
      jitterMs: this.currentJitterMs,
      quality: this.getQuality(),
      samplesCount: this.samples.length,
      lastSyncTimestamp: this.lastSyncTimestamp,
      manualAdjustmentMs: this.manualAdjustmentMs,
      hardwareOutputLatencyMs: this.hardwareOutputLatencyMs,
      effectiveTotalLatencyMs,
    };
  }

  public reset() {
    this.samples = [];
    this.currentOffsetMs = 0;
    this.currentRttMs = 0;
    this.currentJitterMs = 0;
    this.lastSyncTimestamp = 0;
    this.notify();
  }
}

export const timeSync = new TimeSyncEngine();
