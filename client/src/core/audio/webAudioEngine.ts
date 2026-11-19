import { AudioTrackMetadata, DeviceAudioOutput, AudioFormat, AUDIO_MIME_TYPES } from '@echocast/shared';
import { timeSync } from '../sync/timeSync';

export type AudioEngineState = 'unlocked' | 'locked' | 'buffering' | 'ready' | 'playing' | 'paused' | 'error';
export type AudioEngineListener = () => void;

export interface AudioBufferCacheEntry {
  buffer: AudioBuffer;
  lastAccessed: number;
  sizeBytes: number;
}

export class WebAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private currentSourceNode: AudioBufferSourceNode | null = null;

  private currentTrack: AudioTrackMetadata | null = null;
  // LRU cache for decoded AudioBuffers: prevents mobile browser memory exhaustion
  private audioBufferCache: Map<string, AudioBufferCacheEntry> = new Map();
  private maxCacheEntries: number = 3;
  private activeBuffer: AudioBuffer | null = null;
  private lastErrorMessage: string | null = null;
  private currentAbortController: AbortController | null = null;
  private scheduleDelayMs: number = 650;

  private state: AudioEngineState = 'locked';
  private bufferProgress: number = 0;
  private volume: number = 1.0;
  private isMuted: boolean = false;
  private outputType: DeviceAudioOutput = 'speaker';
  private manualOffsetMs: number = 0;
  private currentGeneration: number = 0;
  private playbackStartTimeSec: number = 0; // audioContext time when playback began
  private trackOffsetSec: number = 0;       // track position when started
  private scheduledServerStartTime: number = 0;
  private scheduledStartPositionSec: number = 0;
  private currentSyncErrorMs: number = 0;
  private isDriftCorrectionActive: boolean = false;
  private driftCorrectionRate: number = 1.0;
  private driftMonitorTimer: any = null;
  private listeners: Set<AudioEngineListener> = new Set();
  private endedListeners: Set<() => void> = new Set();

  // Mobile Audio Session Keep-Alive & Screen WakeLock
  private keepAliveOsc: OscillatorNode | null = null;
  private keepAliveGain: GainNode | null = null;
  private wakeLock: any = null;

  constructor() {
    this.detectHardwareLatency();
    this.setupVisibilityWakeLockListener();
  }

  public subscribe(listener: AudioEngineListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public onEnded(listener: () => void): () => void {
    this.endedListeners.add(listener);
    return () => this.endedListeners.delete(listener);
  }

  private notify() {
    for (const l of this.listeners) {
      try {
        l();
      } catch (e) {
        console.error('Error in audio engine listener', e);
      }
    }
  }

  /**
   * Initializes or returns existing AudioContext
   */
  public getAudioContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx({ latencyHint: 'interactive' });

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.isMuted ? 0 : this.volume;

      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 64;
      this.analyser.smoothingTimeConstant = 0.8;

      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);

      this.detectHardwareLatency();
    }
    return this.ctx;
  }

  /**
   * Detect and set hardware output latency
   */
  private detectHardwareLatency() {
    if (!this.ctx) return;
    const baseLat = (this.ctx as any).baseLatency || 0;
    const outLat = (this.ctx as any).outputLatency || 0;
    const totalHwMs = (baseLat + outLat) * 1000;
    timeSync.setHardwareOutputLatency(totalHwMs);
  }

  /**
   * Unlock AudioContext on user interaction with DAC priming & keep-alive
   */
  public async unlock(): Promise<boolean> {
    const ctx = this.getAudioContext();
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch (err) {
        console.warn('AudioContext resume failed:', err);
      }
    }

    // Play an imperceptible micro-buffer to prime the mobile/desktop DAC hardware
    try {
      const silentBuffer = ctx.createBuffer(1, 1, 22050);
      const primer = ctx.createBufferSource();
      primer.buffer = silentBuffer;
      primer.connect(ctx.destination);
      primer.start();
    } catch {
      // Ignore if primer fails
    }

    if (ctx.state === 'running') {
      this.state = this.activeBuffer ? 'ready' : 'unlocked';
      this.startKeepAliveNode();
      this.requestWakeLock();
      this.notify();
      return true;
    }
    return false;
  }

  /**
   * Keep-Alive: Subtle sub-audible oscillator prevents mobile browsers from suspending idle audio thread
   */
  private startKeepAliveNode() {
    if (this.keepAliveOsc || !this.ctx) return;
    try {
      this.keepAliveOsc = this.ctx.createOscillator();
      this.keepAliveGain = this.ctx.createGain();
      // -120dB inaudible amplitude to preserve power while keeping audio pipeline hot
      this.keepAliveGain.gain.setValueAtTime(0.00001, this.ctx.currentTime);
      this.keepAliveOsc.connect(this.keepAliveGain);
      this.keepAliveGain.connect(this.ctx.destination);
      this.keepAliveOsc.start();
    } catch {
      // Keep-alive oscillator unavailable or unsupported
    }
  }

  /**
   * Screen WakeLock: prevents phone screen from locking/throttling during audio playback
   */
  public async requestWakeLock() {
    try {
      if ('wakeLock' in navigator && !this.wakeLock) {
        this.wakeLock = await (navigator as any).wakeLock.request('screen');
        this.wakeLock.addEventListener('release', () => {
          this.wakeLock = null;
        });
      }
    } catch {
      // WakeLock not supported or denied
    }
  }

  public releaseWakeLock() {
    if (this.wakeLock) {
      try {
        this.wakeLock.release();
      } catch {}
      this.wakeLock = null;
    }
  }

  private setupVisibilityWakeLockListener() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && this.state === 'playing') {
          this.requestWakeLock();
        }
      });
    }
  }

  /**
   * Mobile Media Session API: binds lock-screen info and OS media center
   */
  public updateMediaSession(track: AudioTrackMetadata | null, isPlaying: boolean) {
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator && track) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.title,
          artist: track.artist || 'EchoCast Stream',
          album: 'EchoCast Multi-Device Sync',
          artwork: [
            {
              src: track.albumArtUrl || '/favicon.ico',
              sizes: '192x192',
              type: 'image/png',
            },
          ],
        });
        navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
      } catch {
        // MediaSession not supported
      }
    }
  }

  /**
   * Output sink selection (Chrome 110+, Edge, Opera)
   */
  public async setAudioSinkId(sinkId: string): Promise<boolean> {
    const ctx = this.getAudioContext();
    if ('setSinkId' in ctx && typeof (ctx as any).setSinkId === 'function') {
      try {
        await (ctx as any).setSinkId(sinkId);
        return true;
      } catch (e) {
        console.warn('Failed to setSinkId on AudioContext:', e);
      }
    }
    return false;
  }

  public isUnlocked(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  public getState(): AudioEngineState {
    return this.state;
  }

  public getBufferProgress(): number {
    return this.bufferProgress;
  }

  public getCacheCount(): number {
    return this.audioBufferCache.size;
  }

  public getMaxCacheEntries(): number {
    return this.maxCacheEntries;
  }

  public setMaxCacheEntries(max: number): void {
    this.maxCacheEntries = Math.max(1, max);
    this.pruneCache();
    this.notify();
  }

  public clearCache(): void {
    this.audioBufferCache.clear();
    this.notify();
  }

  public getLastErrorMessage(): string | null {
    return this.lastErrorMessage;
  }

  public clearError(): void {
    this.lastErrorMessage = null;
    if (this.state === 'error') {
      this.state = this.isUnlocked() ? (this.activeBuffer ? 'ready' : 'unlocked') : 'locked';
    }
    this.notify();
  }

  public getScheduleDelayMs(): number {
    return this.scheduleDelayMs;
  }

  public setScheduleDelayMs(ms: number): void {
    this.scheduleDelayMs = Math.max(100, Math.min(3000, ms));
  }

  private pruneCache() {
    while (this.audioBufferCache.size > this.maxCacheEntries) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      for (const [key, entry] of this.audioBufferCache.entries()) {
        if (entry.lastAccessed < oldestTime) {
          oldestTime = entry.lastAccessed;
          oldestKey = key;
        }
      }
      if (oldestKey) {
        this.audioBufferCache.delete(oldestKey);
      } else {
        break;
      }
    }
  }

  private addToCache(trackId: string, buffer: AudioBuffer) {
    const sizeBytes = buffer.length * buffer.numberOfChannels * 4;
    this.audioBufferCache.set(trackId, {
      buffer,
      lastAccessed: Date.now(),
      sizeBytes,
    });
    this.pruneCache();
  }

  /**
   * Browser Codec Support Detection
   */
  public static checkCodecSupport(format: AudioFormat): { supported: boolean; reason?: string } {
    if (typeof Audio === 'undefined') return { supported: true };
    const audio = new Audio();
    const mime = AUDIO_MIME_TYPES[format] || `audio/${format}`;
    const canPlay = audio.canPlayType(mime);

    if (canPlay === '') {
      if (format === 'flac') {
        return {
          supported: false,
          reason: 'FLAC audio format is not supported by your browser engine. Please use standard MP3 or WAV.',
        };
      }
      if (format === 'ogg' || format === 'opus') {
        return {
          supported: false,
          reason: `${format.toUpperCase()} container is not supported by Safari/WebKit. Please use MP3 or AAC.`,
        };
      }
    }
    return { supported: true };
  }

  /**
   * Fetch audio stream with exponential backoff retries and AbortSignal support
   */
  private async fetchWithRetry(url: string, signal: AbortSignal, maxRetries = 3): Promise<Response> {
    let lastErr: any = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (signal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      try {
        const response = await fetch(url, { signal });
        if (response.ok) {
          return response;
        }
        if (response.status >= 400 && response.status < 500 && response.status !== 408) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        throw new Error(`HTTP ${response.status}: Server returned error status`);
      } catch (err: any) {
        if (err.name === 'AbortError') throw err;
        lastErr = err;
        if (attempt < maxRetries) {
          const backoff = 250 * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, backoff));
        }
      }
    }
    throw lastErr;
  }

  public getVolume(): number {
    return this.volume;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public getOutputType(): DeviceAudioOutput {
    return this.outputType;
  }

  public getManualOffsetMs(): number {
    return this.manualOffsetMs;
  }

  public getCurrentTrack(): AudioTrackMetadata | null {
    return this.currentTrack;
  }

  /**
   * Set output device type with preset compensation
   */
  public setOutputType(type: DeviceAudioOutput) {
    this.outputType = type;
    if (type === 'bluetooth') {
      // Bluetooth audio typically has ~160ms A2DP packet buffer latency
      this.setManualOffsetMs(160);
    } else if (type === 'speaker') {
      this.setManualOffsetMs(0);
    } else if (type === 'headphones') {
      this.setManualOffsetMs(10);
    }
    this.notify();
  }

  public setManualOffsetMs(ms: number) {
    this.manualOffsetMs = ms;
    timeSync.setManualAdjustment(ms);
    this.notify();
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && !this.isMuted) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx?.currentTime || 0);
    }
    this.notify();
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(muted ? 0 : this.volume, this.ctx.currentTime);
    }
    this.notify();
  }

  /**
   * Pre-fetch, buffer with streaming progress, and decode audio track
   */
  public async loadTrack(track: AudioTrackMetadata): Promise<AudioBuffer | null> {
    this.currentTrack = track;
    this.lastErrorMessage = null;

    if (this.audioBufferCache.has(track.id)) {
      const cached = this.audioBufferCache.get(track.id)!;
      cached.lastAccessed = Date.now();
      this.activeBuffer = cached.buffer;
      this.bufferProgress = 100;
      this.state = this.isUnlocked() ? 'ready' : 'locked';
      this.notify();
      return this.activeBuffer;
    }

    // Codec pre-flight check
    const codecCheck = WebAudioEngine.checkCodecSupport(track.format);
    if (!codecCheck.supported) {
      this.lastErrorMessage = codecCheck.reason || `Audio format ${track.format} not supported on this platform`;
      this.state = 'error';
      this.bufferProgress = 0;
      this.notify();
      return null;
    }

    // Abort previous in-flight fetch if track was changed
    if (this.currentAbortController) {
      this.currentAbortController.abort();
    }
    this.currentAbortController = new AbortController();
    const signal = this.currentAbortController.signal;

    this.state = 'buffering';
    this.bufferProgress = 5;
    this.notify();

    try {
      const response = await this.fetchWithRetry(track.url, signal, 3);

      const contentLength = response.headers.get('content-length');
      const totalBytes = contentLength ? parseInt(contentLength, 10) : track.sizeBytes || 0;

      let arrayBuffer: ArrayBuffer;

      if (response.body && totalBytes > 0 && typeof ReadableStream !== 'undefined') {
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let receivedBytes = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            receivedBytes += value.length;
            this.bufferProgress = Math.min(95, Math.round((receivedBytes / totalBytes) * 95));
            this.notify();
          }
        }

        const merged = new Uint8Array(receivedBytes);
        let offset = 0;
        for (const chunk of chunks) {
          merged.set(chunk, offset);
          offset += chunk.length;
        }
        chunks.length = 0; // Release memory for chunk buffers immediately
        arrayBuffer = merged.buffer;
      } else {
        arrayBuffer = await response.arrayBuffer();
        this.bufferProgress = 90;
        this.notify();
      }

      const ctx = this.getAudioContext();
      const decodedBuffer = await ctx.decodeAudioData(arrayBuffer);

      // Record accurate decoded duration
      track.durationSec = decodedBuffer.duration;
      if (track.sourceType === 'file') {
        fetch(`/api/audio/tracks/${track.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ durationSec: decodedBuffer.duration }),
        }).catch(() => {});
      }

      this.addToCache(track.id, decodedBuffer);
      this.activeBuffer = decodedBuffer;
      this.bufferProgress = 100;
      this.state = this.isUnlocked() ? 'ready' : 'locked';
      this.notify();
      return decodedBuffer;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return null;
      }
      console.error(`Failed to load and decode track ${track.title}`, err);
      this.lastErrorMessage = err.message || `Failed to stream or decode audio file (${track.format.toUpperCase()})`;
      this.state = 'error';
      this.bufferProgress = 0;
      this.notify();
      return null;
    }
  }

  /**
   * Synchronized Playback: schedules AudioBufferSourceNode at exact target Web Audio clock.
   * Avoids unnecessary playback restarts when already in sync.
   * Includes dynamic catch-up recovery when buffering finishes after scheduled time.
   */
  public async schedulePlay(scheduledServerTime: number, startPositionSec: number = 0, generation: number = 0) {
    if (generation < this.currentGeneration) {
      return; // Ignore stale command
    }

    const currentServerTime = timeSync.getServerTime();

    // Avoid unnecessary playback restarts:
    // If we are already playing the same track and generation matches, check drift
    if (
      this.state === 'playing' &&
      this.currentSourceNode &&
      this.currentTrack &&
      generation === this.currentGeneration
    ) {
      const currentPos = this.getCurrentPosition();
      let expectedPos = startPositionSec;
      if (scheduledServerTime > 0) {
        const elapsedSec = (currentServerTime - scheduledServerTime) / 1000;
        expectedPos = startPositionSec + Math.max(0, elapsedSec);
      }
      const driftSec = Math.abs(currentPos - expectedPos);

      // If drift is less than 45ms, receiver is already synchronized in phase!
      if (driftSec < 0.045) {
        return;
      }

      // If drift is small (45ms to 150ms), gently adjust playback rate without audible restart
      if (driftSec < 0.150 && this.ctx) {
        const rate = currentPos < expectedPos ? 1.015 : 0.985;
        this.currentSourceNode.playbackRate.setValueAtTime(rate, this.ctx.currentTime);
        this.currentSourceNode.playbackRate.setValueAtTime(1.0, this.ctx.currentTime + 0.35);
        return;
      }
    }

    this.currentGeneration = generation;

    const ctx = this.getAudioContext();
    if (ctx.state !== 'running') {
      await this.unlock();
    }

    if (!this.activeBuffer && this.currentTrack) {
      await this.loadTrack(this.currentTrack);
    }

    if (!this.activeBuffer) {
      console.warn('Cannot play: active audio buffer not available');
      return;
    }

    this.stopActiveSource();

    // Latency compensated scheduling and dynamic catch-up
    const currentServerNow = timeSync.getServerTime();
    const effectiveLatencyMs = timeSync.getMetrics().effectiveTotalLatencyMs;
    const timeDeltaMs = scheduledServerTime - currentServerNow;

    let targetAudioContextTime: number;
    let safeOffset: number;

    if (timeDeltaMs < 0) {
      // The scheduled start time was in the past (e.g. network buffering delay or receiver joined mid-stream)
      // Calculate how much time has elapsed since scheduled start, compensated for output latency
      const elapsedSec = (Math.abs(timeDeltaMs) + effectiveLatencyMs) / 1000;
      const livePositionSec = startPositionSec + elapsedSec;

      if (livePositionSec >= this.activeBuffer.duration) {
        // Track has already ended
        this.state = 'ready';
        this.notify();
        return;
      }

      // Start immediately from current live offset
      targetAudioContextTime = ctx.currentTime;
      safeOffset = Math.max(0, Math.min(livePositionSec, this.activeBuffer.duration - 0.05));
    } else {
      // Normal scheduled start in future
      const adjustedDeltaSec = Math.max(0, (timeDeltaMs - effectiveLatencyMs) / 1000);
      targetAudioContextTime = ctx.currentTime + adjustedDeltaSec;
      safeOffset = Math.max(0, Math.min(startPositionSec, this.activeBuffer.duration - 0.05));
    }

    const source = ctx.createBufferSource();
    source.buffer = this.activeBuffer;
    source.connect(this.masterGain!);

    source.onended = () => {
      if (this.currentSourceNode === source) {
        this.stopDriftMonitor();
        this.currentSourceNode = null;
        this.state = 'ready';
        this.updateMediaSession(this.currentTrack, false);
        this.notify();
        for (const cb of this.endedListeners) {
          try {
            cb();
          } catch (e) {
            console.error('Error in onEnded callback', e);
          }
        }
      }
    };

    source.start(targetAudioContextTime, safeOffset);
    this.currentSourceNode = source;
    this.playbackStartTimeSec = targetAudioContextTime;
    this.trackOffsetSec = safeOffset;
    this.scheduledServerStartTime = scheduledServerTime;
    this.scheduledStartPositionSec = startPositionSec;
    this.state = 'playing';

    this.startDriftMonitor();
    this.requestWakeLock();
    this.updateMediaSession(this.currentTrack, true);
    this.notify();
  }

  /**
   * Start active drift monitoring loop during synchronized playback
   */
  private startDriftMonitor() {
    if (this.driftMonitorTimer) clearInterval(this.driftMonitorTimer);
    this.driftMonitorTimer = setInterval(() => {
      this.evaluateAndCorrectDrift();
    }, 1200);
  }

  private stopDriftMonitor() {
    if (this.driftMonitorTimer) {
      clearInterval(this.driftMonitorTimer);
      this.driftMonitorTimer = null;
    }
    if (this.isDriftCorrectionActive && this.currentSourceNode && this.ctx) {
      try {
        this.currentSourceNode.playbackRate.setValueAtTime(1.0, this.ctx.currentTime);
      } catch {}
    }
    this.isDriftCorrectionActive = false;
    this.driftCorrectionRate = 1.0;
  }

  /**
   * Active drift evaluation and acoustic alignment correction:
   * - <= 20ms: deadband (in-phase lock, 1.0x rate)
   * - 20ms to 120ms: pitch-neutral soft rate nudge (1.015x or 0.985x)
   * - 120ms to 300ms: moderate rate nudge (1.03x or 0.97x)
   * - > 300ms: hard resynchronization catch-up
   */
  public evaluateAndCorrectDrift() {
    if (this.state !== 'playing' || !this.currentSourceNode || !this.ctx || !this.activeBuffer) {
      return;
    }

    const currentServerTime = timeSync.getServerTime();
    const currentPos = this.getCurrentPosition();

    // Calculate where this track SHOULD be right now according to the synchronized server clock:
    let expectedPos = this.scheduledStartPositionSec;
    if (this.scheduledServerStartTime > 0) {
      const elapsedSec = (currentServerTime - this.scheduledServerStartTime) / 1000;
      expectedPos = this.scheduledStartPositionSec + Math.max(0, elapsedSec);
    }

    if (expectedPos >= this.activeBuffer.duration) {
      return;
    }

    // Drift: positive = receiver is leading (ahead of host), negative = receiver is lagging (behind host)
    const driftSec = currentPos - expectedPos;
    const driftMs = driftSec * 1000;
    this.currentSyncErrorMs = Math.round(driftMs);
    const absDriftMs = Math.abs(driftMs);

    // 1. Deadband protection: <= 20ms deviation is considered in-phase lock
    if (absDriftMs <= 20) {
      if (this.isDriftCorrectionActive) {
        this.currentSourceNode.playbackRate.setValueAtTime(1.0, this.ctx.currentTime);
        this.isDriftCorrectionActive = false;
        this.driftCorrectionRate = 1.0;
        this.notify();
      }
      return;
    }

    // 2. Minor drift: 20ms to 120ms (smooth ±1.5% pitch-neutral rate nudge)
    if (absDriftMs <= 120) {
      const targetRate = driftMs < 0 ? 1.015 : 0.985;
      this.currentSourceNode.playbackRate.setValueAtTime(targetRate, this.ctx.currentTime);
      this.isDriftCorrectionActive = true;
      this.driftCorrectionRate = targetRate;
      this.notify();
      return;
    }

    // 3. Moderate drift: 120ms to 300ms (±3.0% rate nudge)
    if (absDriftMs <= 300) {
      const targetRate = driftMs < 0 ? 1.03 : 0.97;
      this.currentSourceNode.playbackRate.setValueAtTime(targetRate, this.ctx.currentTime);
      this.isDriftCorrectionActive = true;
      this.driftCorrectionRate = targetRate;
      this.notify();
      return;
    }

    // 4. Severe drift: > 300ms (e.g. mobile tab suspended or prolonged Wi-Fi dropout)
    // Perform hard resynchronization to snap back into lockstep
    this.schedulePlay(this.scheduledServerStartTime, this.scheduledStartPositionSec, this.currentGeneration);
  }

  public getCurrentSyncErrorMs(): number {
    return this.currentSyncErrorMs;
  }

  public getDriftCorrectionInfo(): { active: boolean; rate: number } {
    return {
      active: this.isDriftCorrectionActive,
      rate: this.driftCorrectionRate,
    };
  }

  /**
   * Pause playback
   */
  public schedulePause(_scheduledServerTime: number, _pausePositionSec: number, generation: number = 0) {
    if (generation < this.currentGeneration) return;
    this.currentGeneration = generation;
    this.stopActiveSource();
    this.state = 'paused';
    this.updateMediaSession(this.currentTrack, false);
    this.notify();
  }

  /**
   * Seek playback
   */
  public async scheduleSeek(scheduledServerTime: number, targetPositionSec: number, generation: number = 0) {
    if (generation < this.currentGeneration) return;
    this.currentGeneration = generation;
    await this.schedulePlay(scheduledServerTime, targetPositionSec, generation);
  }

  public stop() {
    this.stopActiveSource();
    this.trackOffsetSec = 0;
    this.state = 'ready';
    this.releaseWakeLock();
    this.updateMediaSession(this.currentTrack, false);
    this.notify();
  }

  private stopActiveSource() {
    this.stopDriftMonitor();
    if (this.currentSourceNode) {
      try {
        this.currentSourceNode.onended = null;
        this.currentSourceNode.stop();
        this.currentSourceNode.disconnect();
      } catch {
        // Source node might already have ended
      }
      this.currentSourceNode = null;
    }
  }

  /**
   * Current estimated track position in seconds
   */
  public getCurrentPosition(): number {
    if (this.state === 'playing' && this.ctx) {
      const elapsed = Math.max(0, this.ctx.currentTime - this.playbackStartTimeSec);
      const pos = this.trackOffsetSec + elapsed;
      if (this.activeBuffer && pos >= this.activeBuffer.duration) {
        return this.activeBuffer.duration;
      }
      return pos;
    }
    return this.trackOffsetSec;
  }

  public getDuration(): number {
    return this.activeBuffer ? this.activeBuffer.duration : (this.currentTrack?.durationSec || 0);
  }

  /**
   * Frequency data for live audio visualizer
   */
  public getFrequencyData(array: Uint8Array): void {
    if (this.analyser && this.state === 'playing') {
      this.analyser.getByteFrequencyData(array as any);
    } else {
      array.fill(0);
    }
  }

  /**
   * Play high-precision synchronized test click/tone via OscillatorNode
   */
  public playTestPulse(scheduledServerTime: number, frequencyHz: number = 1000, durationMs: number = 60) {
    const ctx = this.getAudioContext();
    if (ctx.state !== 'running') return;

    const currentServerTime = timeSync.getServerTime();
    const timeDeltaMs = scheduledServerTime - currentServerTime;
    const effectiveLatencyMs = timeSync.getMetrics().effectiveTotalLatencyMs;
    const adjustedDeltaSec = (timeDeltaMs - effectiveLatencyMs) / 1000;
    const targetAudioTime = Math.max(ctx.currentTime, ctx.currentTime + adjustedDeltaSec);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequencyHz, targetAudioTime);

    const durationSec = durationMs / 1000;
    // Fast attack and exponential decay for clean tick
    gain.gain.setValueAtTime(0, targetAudioTime);
    gain.gain.linearRampToValueAtTime(0.8, targetAudioTime + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, targetAudioTime + durationSec);

    osc.connect(gain);
    gain.connect(this.masterGain || ctx.destination);

    osc.start(targetAudioTime);
    osc.stop(targetAudioTime + durationSec);
  }
}

export const webAudioEngine = new WebAudioEngine();
