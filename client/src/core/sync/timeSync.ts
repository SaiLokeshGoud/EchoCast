import { SyncMetrics, SyncQuality, SyncSample } from '@echocast/shared';

export type SyncUpdateListener = (metrics: SyncMetrics) => void;

export class TimeSyncEngine {
  private samples: SyncSample[] = [];
  private readonly maxSamples: number = 25;
  private currentOffsetMs: number = 0;
  private currentRttMs: number = 0;
  private currentJitterMs: number = 0;
  private clockDriftPpm: number = 0; // Estimated oscillator skew in parts per million
  private manualAdjustmentMs: number = 0;
  private hardwareOutputLatencyMs: number = 0;
  private lastSyncTimestamp: number = 0;
  private listeners: Set<SyncUpdateListener> = new Set();
  private calibrationListeners: Set<() => void> = new Set();

  public subscribe(listener: SyncUpdateListener): () => void {
    this.listeners.add(listener);
    listener(this.getMetrics());
    return () => this.listeners.delete(listener);
  }

  public onNeedsCalibration(listener: () => void): () => void {
    this.calibrationListeners.add(listener);
    return () => this.calibrationListeners.delete(listener);
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

  private triggerCalibration() {
    for (const listener of this.calibrationListeners) {
      try {
        listener();
      } catch (e) {
        console.error('Error in calibration listener', e);
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
   * Calculate server timestamp from current local time.
   * ServerTime = LocalTime + ClockOffset (with drift interpolation between sync bursts)
   */
  public getServerTime(localTime: number = this.getLocalTime()): number {
    let offset = this.currentOffsetMs;
    // If we have an active drift estimate and recent sync, interpolate
    if (this.lastSyncTimestamp > 0 && Math.abs(this.clockDriftPpm) > 0) {
      const elapsedSec = (localTime - this.lastSyncTimestamp) / 1000;
      // Cap extrapolation to max 10 seconds to prevent run-away drift
      if (elapsedSec > 0 && elapsedSec <= 10) {
        offset += elapsedSec * (this.clockDriftPpm / 1000);
      }
    }
    return localTime + offset;
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

    const previousOffset = this.currentOffsetMs;
    this.samples.push(sample);
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }

    this.recomputeOffset();
    this.lastSyncTimestamp = t3;

    // Detect sudden offset jump or elevated jitter: trigger adaptive burst
    if (this.samples.length >= 3) {
      const offsetDelta = Math.abs(this.currentOffsetMs - previousOffset);
      if (offsetDelta > 20 || this.currentJitterMs > 25) {
        this.triggerCalibration();
      }
    }

    this.notify();
    return sample;
  }

  /**
   * Compute filtered offset rejecting outliers using lowest RTT weighting and EMA smoothing
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

    // Weighted average: inverse RTT squared weighting strongly rewards cleanest packet transfers
    let totalWeight = 0;
    let weightedOffsetSum = 0;
    let rttSum = 0;

    for (const s of bestSamples) {
      const weight = 1 / Math.pow(Math.max(1, s.roundTripTimeMs), 2);
      totalWeight += weight;
      weightedOffsetSum += s.offsetMs * weight;
      rttSum += s.roundTripTimeMs;
    }

    const newTargetOffset = weightedOffsetSum / totalWeight;
    this.currentRttMs = rttSum / bestSamples.length;

    // Exponential moving average for clock offset to prevent discontinuous audio jumps
    const alpha = this.samples.length < 5 ? 0.5 : 0.25;
    this.currentOffsetMs = alpha * newTargetOffset + (1 - alpha) * this.currentOffsetMs;

    // Calculate jitter as standard deviation of offset in best samples
    const variance =
      bestSamples.reduce((sum, s) => sum + Math.pow(s.offsetMs - this.currentOffsetMs, 2), 0) /
      bestSamples.length;
    this.currentJitterMs = Math.sqrt(variance);

    // Estimate crystal oscillator skew (clock drift) if we have enough sample history
    if (this.samples.length >= 8) {
      const first = this.samples[0];
      const last = this.samples[this.samples.length - 1];
      const timeSpanSec = (last.timestamp - first.timestamp) / 1000;
      if (timeSpanSec >= 4) {
        const offsetChangeMs = last.offsetMs - first.offsetMs;
        // ppm = (ms / sec) * 1000
        this.clockDriftPpm = Math.max(-100, Math.min(100, (offsetChangeMs / timeSpanSec) * 1000));
      }
    }
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
    if (absOffset <= 5 && this.currentRttMs <= 25 && this.currentJitterMs <= 4) return 'excellent';
    if (absOffset <= 15 && this.currentRttMs <= 60 && this.currentJitterMs <= 10) return 'good';
    if (absOffset <= 35 && this.currentRttMs <= 120 && this.currentJitterMs <= 25) return 'fair';
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

  public getClockDriftPpm(): number {
    return this.clockDriftPpm;
  }

  public reset() {
    this.samples = [];
    this.currentOffsetMs = 0;
    this.currentRttMs = 0;
    this.currentJitterMs = 0;
    this.clockDriftPpm = 0;
    this.lastSyncTimestamp = 0;
    this.notify();
  }
}

export const timeSync = new TimeSyncEngine();
