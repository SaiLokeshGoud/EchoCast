import {
  AudioTrackMetadata,
  DeviceAudioOutput,
  AudioFormat,
  AUDIO_MIME_TYPES,
  BroadcastTimeline,
  RadioDiagnosticsInfo,
  calculateTimelinePositionSec,
} from '@echocast/shared';
import { timeSync } from '../sync/timeSync';

export type AudioEngineState = 'unlocked' | 'locked' | 'buffering' | 'ready' | 'playing' | 'paused' | 'error';
export type AudioEngineListener = () => void;

export interface AudioBufferCacheEntry {
  buffer: AudioBuffer;
  lastAccessed: number;
  sizeBytes: number;
}

interface DecodedRadioChunk {
  index: number;
  startSec: number;
  durationSec: number;
  buffer: AudioBuffer;
  generation: number;
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

  // Synchronized Radio Broadcast Timeline & Adaptive Jitter Buffer
  private timeline: BroadcastTimeline | null = null;
  private jitterBuffer: Map<number, DecodedRadioChunk> = new Map();
  private scheduledChunkSources: Map<number, AudioBufferSourceNode> = new Map();
  private inFlightChunkFetches: Set<number> = new Set();
  private nextScheduledCtxTime: number = 0;
  private radioSchedulerTimer: any = null;
  private underrunCount: number = 0;
  private isPhaseLocked: boolean = false;
  private chunkDurationSec: number = 1.0;
  private isRadioChunkStreaming: boolean = false;

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
        if (document.visibilityState === 'visible') {
          // Attempt to resume audio context if iOS Safari suspended or interrupted it
          if (this.ctx && (this.ctx.state === 'suspended' || (this.ctx.state as any) === 'interrupted')) {
            this.ctx.resume().catch(() => {});
          }
          if (this.state === 'playing') {
            this.requestWakeLock();
          }
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

  public isPlaying(): boolean {
    return this.state === 'playing';
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
  /**
   * Update or align with authoritative Broadcast Timeline
   */
  public async updateTimeline(timeline: BroadcastTimeline) {
    if (timeline.generation < this.currentGeneration) {
      return; // Ignore stale timeline
    }

    const prevGeneration = this.currentGeneration;
    const prevTrackId = this.timeline?.trackId;
    this.timeline = timeline;
    this.currentGeneration = timeline.generation;

    if (timeline.track) {
      this.currentTrack = timeline.track;
    }

    // If generation changed or track changed, flush queued chunks from previous generation
    if (timeline.generation !== prevGeneration || timeline.trackId !== prevTrackId) {
      this.flushScheduledSources();
      this.jitterBuffer.clear();
      this.inFlightChunkFetches.clear();
      this.nextScheduledCtxTime = 0;
    }

    if (timeline.state === 'playing') {
      if (this.isUnlocked()) {
        await this.startRadioBroadcastPlayback(timeline);
      }
    } else if (timeline.state === 'paused') {
      this.pause();
    } else if (timeline.state === 'stopped') {
      this.stop();
    }
  }

  public getBroadcastTimeline(): BroadcastTimeline | null {
    return this.timeline;
  }

  public isRadioStreaming(): boolean {
    return this.isRadioChunkStreaming;
  }

  /**
   * Start or resume continuous synchronized radio playback from broadcast timeline
   */
  private async startRadioBroadcastPlayback(timeline: BroadcastTimeline) {
    const ctx = this.getAudioContext();
    if (ctx.state !== 'running') {
      await this.unlock();
    }

    const currentServerTime = timeSync.getServerTime();
    const livePos = calculateTimelinePositionSec(timeline, currentServerTime);
    const startChunkIndex = Math.max(0, Math.floor(livePos / this.chunkDurationSec));

    this.state = 'playing';
    this.scheduledServerStartTime = timeline.broadcastStartTime;
    this.scheduledStartPositionSec = timeline.startPositionSec;
    this.isRadioChunkStreaming = true;

    // Start background scheduler and drift monitor loops
    this.startRadioScheduler();
    this.startDriftMonitor();
    this.requestWakeLock();
    this.updateMediaSession(this.currentTrack, true);
    this.notify();

    // Immediately fetch starting chunks to prime the jitter buffer
    const trackId = timeline.trackId || this.currentTrack?.id || '';
    if (trackId) {
      this.fetchChunk(trackId, startChunkIndex, timeline.generation);
      this.fetchChunk(trackId, startChunkIndex + 1, timeline.generation);
      this.fetchChunk(trackId, startChunkIndex + 2, timeline.generation);
    }
    this.processJitterQueue();
  }

  /**
   * Adaptive Receiver Jitter Buffer processing and Web Audio gapless chunk scheduler
   */
  private processJitterQueue() {
    if (!this.timeline || this.timeline.state !== 'playing' || !this.ctx) return;

    const currentServerTime = timeSync.getServerTime();
    const livePos = calculateTimelinePositionSec(this.timeline, currentServerTime);
    const currentChunkIndex = Math.max(0, Math.floor(livePos / this.chunkDurationSec));

    // Keep audio scheduled 2 seconds ahead on the AudioContext timeline
    const scheduleAheadLimit = this.ctx.currentTime + 2.0;

    // Prune chunks in jitter buffer that are completely in the past
    for (const [idx] of this.jitterBuffer.entries()) {
      if (idx < currentChunkIndex - 1) {
        this.jitterBuffer.delete(idx);
      }
    }

    let chunkToSchedule = currentChunkIndex;
    if (this.nextScheduledCtxTime > this.ctx.currentTime) {
      const scheduledAheadSec = this.nextScheduledCtxTime - this.ctx.currentTime;
      chunkToSchedule = Math.floor((livePos + scheduledAheadSec) / this.chunkDurationSec);
    }

    while (this.nextScheduledCtxTime < scheduleAheadLimit) {
      const chunk = this.jitterBuffer.get(chunkToSchedule);
      const trackId = this.timeline.trackId || this.currentTrack?.id;

      if (!chunk) {
        // Chunk not buffered yet: request it
        if (trackId && !this.inFlightChunkFetches.has(chunkToSchedule)) {
          this.fetchChunk(trackId, chunkToSchedule, this.timeline.generation);
        }

        // Check for buffer underrun
        if (this.nextScheduledCtxTime > 0 && this.nextScheduledCtxTime <= this.ctx.currentTime + 0.05) {
          if (this.state === 'playing') {
            this.state = 'buffering';
            this.underrunCount++;
            this.notify();
          }
        }
        break;
      }

      // Schedule contiguous chunk onto Web Audio graph
      if (!this.scheduledChunkSources.has(chunkToSchedule)) {
        const chunkStartServerTime = this.timeline.broadcastStartTime + Math.round(chunk.startSec * 1000);
        const timeDeltaMs = chunkStartServerTime - currentServerTime;
        const effectiveLatSec = timeSync.getMetrics().effectiveTotalLatencyMs / 1000;
        const calcTargetCtxTime = this.ctx.currentTime + (timeDeltaMs / 1000) - effectiveLatSec;

        let scheduledStart: number;
        let offsetIntoChunk: number = 0;

        if (this.nextScheduledCtxTime <= this.ctx.currentTime) {
          // First chunk starting
          if (calcTargetCtxTime < this.ctx.currentTime) {
            offsetIntoChunk = Math.max(0, this.ctx.currentTime - calcTargetCtxTime);
            if (offsetIntoChunk >= chunk.durationSec) {
              // Entire chunk was in the past, move to next
              chunkToSchedule++;
              continue;
            }
            scheduledStart = this.ctx.currentTime;
          } else {
            scheduledStart = calcTargetCtxTime;
            offsetIntoChunk = 0;
          }
        } else {
          // Subsequent chained chunk: schedule seamlessly at nextScheduledCtxTime
          scheduledStart = Math.max(this.ctx.currentTime, this.nextScheduledCtxTime);
          offsetIntoChunk = 0;
        }

        const source = this.ctx.createBufferSource();
        source.buffer = chunk.buffer;
        source.playbackRate.value = this.driftCorrectionRate;
        source.connect(this.masterGain!);

        const capturedChunkIdx = chunkToSchedule;
        source.onended = () => {
          this.scheduledChunkSources.delete(capturedChunkIdx);
          this.jitterBuffer.delete(capturedChunkIdx);
        };

        const effectiveDuration = (chunk.durationSec - offsetIntoChunk) / this.driftCorrectionRate;
        source.start(scheduledStart, offsetIntoChunk);
        this.scheduledChunkSources.set(chunkToSchedule, source);
        this.nextScheduledCtxTime = scheduledStart + effectiveDuration;

        if (this.state === 'buffering') {
          this.state = 'playing';
          this.notify();
        }
      }

      chunkToSchedule++;
    }

    // Pre-fetch upcoming chunks to maintain 2-3 chunks buffer
    const activeTrackId = this.timeline.trackId || this.currentTrack?.id;
    if (activeTrackId) {
      for (let i = 0; i < 3; i++) {
        const aheadIdx = currentChunkIndex + i;
        if (!this.jitterBuffer.has(aheadIdx) && !this.inFlightChunkFetches.has(aheadIdx)) {
          this.fetchChunk(activeTrackId, aheadIdx, this.timeline.generation);
        }
      }
    }
  }

  /**
   * Fetch and decode a 1-second WAV chunk into AudioBuffer
   */
  private async fetchChunk(trackId: string, chunkIndex: number, generation: number) {
    if (this.inFlightChunkFetches.has(chunkIndex) || this.jitterBuffer.has(chunkIndex)) {
      return;
    }
    if (chunkIndex < 0 || !trackId) return;

    this.inFlightChunkFetches.add(chunkIndex);

    try {
      const res = await fetch(`/api/audio/chunk/${encodeURIComponent(trackId)}/${chunkIndex}`);
      if (!res.ok) {
        this.inFlightChunkFetches.delete(chunkIndex);
        return;
      }

      const arrayBuffer = await res.arrayBuffer();

      if (generation !== this.currentGeneration) {
        this.inFlightChunkFetches.delete(chunkIndex);
        return;
      }

      const ctx = this.getAudioContext();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

      const chunkEntry: DecodedRadioChunk = {
        index: chunkIndex,
        startSec: chunkIndex * this.chunkDurationSec,
        durationSec: audioBuffer.duration,
        buffer: audioBuffer,
        generation,
      };

      this.jitterBuffer.set(chunkIndex, chunkEntry);
      this.inFlightChunkFetches.delete(chunkIndex);
      this.notify();

      this.processJitterQueue();
    } catch {
      this.inFlightChunkFetches.delete(chunkIndex);
    }
  }

  private flushScheduledSources() {
    for (const [, source] of this.scheduledChunkSources.entries()) {
      try {
        source.onended = null;
        source.stop();
        source.disconnect();
      } catch {}
    }
    this.scheduledChunkSources.clear();
    this.nextScheduledCtxTime = 0;
  }

  private resyncToTimeline() {
    if (!this.timeline || this.timeline.state !== 'playing') return;

    this.flushScheduledSources();
    this.jitterBuffer.clear();
    this.inFlightChunkFetches.clear();
    this.nextScheduledCtxTime = 0;

    const currentServerTime = timeSync.getServerTime();
    const livePos = calculateTimelinePositionSec(this.timeline, currentServerTime);
    const startChunkIndex = Math.max(0, Math.floor(livePos / this.chunkDurationSec));

    const trackId = this.timeline.trackId || this.currentTrack?.id || '';
    if (trackId) {
      this.fetchChunk(trackId, startChunkIndex, this.timeline.generation);
      this.fetchChunk(trackId, startChunkIndex + 1, this.timeline.generation);
    }
  }

  private startRadioScheduler() {
    if (this.radioSchedulerTimer) clearInterval(this.radioSchedulerTimer);
    this.radioSchedulerTimer = setInterval(() => {
      this.processJitterQueue();
    }, 80);
  }

  private stopRadioScheduler() {
    if (this.radioSchedulerTimer) {
      clearInterval(this.radioSchedulerTimer);
      this.radioSchedulerTimer = null;
    }
  }

  /**
   * Synchronized Playback command handler
   */
  public async schedulePlay(scheduledServerTime: number, startPositionSec: number = 0, generation: number = 0) {
    if (generation < this.currentGeneration) {
      return; // Ignore stale command
    }

    const currentServerTime = timeSync.getServerTime();

    // If already playing in sync, do not restart
    if (this.state === 'playing' && this.currentTrack) {
      const currentPos = this.getCurrentPosition();
      let expectedPos = startPositionSec;
      if (scheduledServerTime > 0) {
        const elapsedSec = (currentServerTime - scheduledServerTime) / 1000;
        expectedPos = startPositionSec + Math.max(0, elapsedSec);
      }
      const driftSec = Math.abs(currentPos - expectedPos);

      if (driftSec < 0.150) {
        if (driftSec > 0.025) {
          const rate = currentPos < expectedPos ? 1.005 : 0.995;
          this.applyPlaybackRateToAll(rate);
        }
        return;
      }
    }

    this.currentGeneration = generation;

    // Create or update authoritative BroadcastTimeline representation
    const timeline: BroadcastTimeline = {
      timelineId: `tl-${Date.now()}-${generation}`,
      generation,
      state: 'playing',
      trackId: this.currentTrack?.id || null,
      track: this.currentTrack,
      startPositionSec,
      broadcastStartTime: scheduledServerTime,
      playbackRate: 1.0,
      chunkDurationSec: this.chunkDurationSec,
      serverTime: currentServerTime,
      currentPositionSec: startPositionSec,
    };

    await this.updateTimeline(timeline);
  }

  /**
   * Start active drift monitoring loop during synchronized playback
   */
  private startDriftMonitor() {
    if (this.driftMonitorTimer) clearInterval(this.driftMonitorTimer);
    this.driftMonitorTimer = setInterval(() => {
      this.evaluateAndCorrectDrift();
    }, 500);
  }

  private stopDriftMonitor() {
    if (this.driftMonitorTimer) {
      clearInterval(this.driftMonitorTimer);
      this.driftMonitorTimer = null;
    }
    if (this.isDriftCorrectionActive) {
      this.applyPlaybackRateToAll(1.0);
    }
    this.isDriftCorrectionActive = false;
    this.driftCorrectionRate = 1.0;
    this.isPhaseLocked = true;
  }

  /**
   * Continuous Phase-Locked Loop (PLL) drift evaluation and acoustic alignment correction:
   * - <= 15ms: deadband (in-phase lock, 1.0x rate)
   * - 15ms to 100ms: pitch-neutral soft rate nudge (±0.3%, inaudible)
   * - 100ms to 250ms: moderate rate nudge (±1.5%)
   * - > 250ms: hard resynchronization catch-up
   */
  public evaluateAndCorrectDrift() {
    if (this.state !== 'playing' || !this.ctx) {
      return;
    }

    const currentServerTime = timeSync.getServerTime();
    let expectedPos: number;

    if (this.timeline && this.timeline.state === 'playing') {
      expectedPos = calculateTimelinePositionSec(this.timeline, currentServerTime);
    } else {
      expectedPos = this.scheduledStartPositionSec;
      if (this.scheduledServerStartTime > 0) {
        const elapsedSec = (currentServerTime - this.scheduledServerStartTime) / 1000;
        expectedPos = this.scheduledStartPositionSec + Math.max(0, elapsedSec);
      }
    }

    const currentPos = this.getCurrentPosition();
    const driftSec = currentPos - expectedPos;
    const driftMs = driftSec * 1000;
    this.currentSyncErrorMs = Math.round(driftMs);
    const absDriftMs = Math.abs(driftMs);

    // 1. Deadband protection: <= 15ms is in-phase acoustic lock
    if (absDriftMs <= 15) {
      this.isPhaseLocked = true;
      if (this.isDriftCorrectionActive) {
        this.applyPlaybackRateToAll(1.0);
        this.isDriftCorrectionActive = false;
        this.driftCorrectionRate = 1.0;
        this.notify();
      }
      return;
    }

    this.isPhaseLocked = false;

    // 2. Minor drift: 15ms to 100ms (inaudible ±0.3% rate steer)
    if (absDriftMs <= 100) {
      const targetRate = driftMs < 0 ? 1.003 : 0.997;
      this.applyPlaybackRateToAll(targetRate);
      this.isDriftCorrectionActive = true;
      this.driftCorrectionRate = targetRate;
      this.notify();
      return;
    }

    // 3. Moderate drift: 100ms to 250ms (±1.5% rate steer)
    if (absDriftMs <= 250) {
      const targetRate = driftMs < 0 ? 1.015 : 0.985;
      this.applyPlaybackRateToAll(targetRate);
      this.isDriftCorrectionActive = true;
      this.driftCorrectionRate = targetRate;
      this.notify();
      return;
    }

    // 4. Severe drift: > 250ms -> hard resynchronization catch-up
    if (this.timeline) {
      this.resyncToTimeline();
    }
  }

  private applyPlaybackRateToAll(rate: number) {
    if (!this.ctx) return;
    if (this.currentSourceNode) {
      try {
        this.currentSourceNode.playbackRate.setTargetAtTime(rate, this.ctx.currentTime, 0.05);
      } catch {}
    }
    for (const src of this.scheduledChunkSources.values()) {
      try {
        src.playbackRate.setTargetAtTime(rate, this.ctx.currentTime, 0.05);
      } catch {}
    }
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
   * Detailed Synchronized Radio diagnostics for monitoring panel
   */
  public getRadioDiagnostics(): RadioDiagnosticsInfo {
    const serverNow = timeSync.getServerTime();
    const broadcastPos = this.timeline ? calculateTimelinePositionSec(this.timeline, serverNow) : 0;
    const receiverPos = this.getCurrentPosition();
    const bufferedChunks = this.jitterBuffer.size;
    const bufferedDurationSec = bufferedChunks * this.chunkDurationSec;
    const rttMs = timeSync.getMetrics().roundTripTimeMs;

    return {
      broadcastPositionSec: Math.max(0, broadcastPos),
      receiverPositionSec: Math.max(0, receiverPos),
      syncErrorMs: this.currentSyncErrorMs,
      jitterBufferDurationSec: bufferedDurationSec,
      jitterBufferChunks: bufferedChunks,
      underrunCount: this.underrunCount,
      driftRate: this.driftCorrectionRate,
      isPhaseLocked: this.isPhaseLocked,
      rttMs,
    };
  }

  /**
   * Pause playback immediately
   */
  public pause() {
    this.flushScheduledSources();
    this.stopActiveSource();
    this.stopRadioScheduler();
    this.state = 'paused';
    if (this.timeline) {
      this.timeline.state = 'paused';
      this.timeline.startPositionSec = this.getCurrentPosition();
    }
    this.updateMediaSession(this.currentTrack, false);
    this.notify();
  }

  /**
   * Pause playback
   */
  public schedulePause(_scheduledServerTime: number, pausePositionSec: number, generation: number = 0) {
    if (generation < this.currentGeneration) return;
    this.currentGeneration = generation;
    this.trackOffsetSec = pausePositionSec;
    this.pause();
  }

  /**
   * Seek playback
   */
  public async scheduleSeek(scheduledServerTime: number, targetPositionSec: number, generation: number = 0) {
    if (generation < this.currentGeneration) return;
    this.currentGeneration = generation;
    this.flushScheduledSources();
    this.jitterBuffer.clear();
    this.inFlightChunkFetches.clear();
    this.trackOffsetSec = targetPositionSec;

    const currentServerTime = timeSync.getServerTime();
    const timeline: BroadcastTimeline = {
      timelineId: `tl-${Date.now()}-${generation}`,
      generation,
      state: this.state === 'playing' ? 'playing' : 'paused',
      trackId: this.currentTrack?.id || null,
      track: this.currentTrack,
      startPositionSec: targetPositionSec,
      broadcastStartTime: scheduledServerTime,
      playbackRate: 1.0,
      chunkDurationSec: this.chunkDurationSec,
      serverTime: currentServerTime,
      currentPositionSec: targetPositionSec,
    };

    await this.updateTimeline(timeline);
  }

  public stop() {
    this.flushScheduledSources();
    this.stopActiveSource();
    this.stopRadioScheduler();
    this.jitterBuffer.clear();
    this.inFlightChunkFetches.clear();
    this.trackOffsetSec = 0;
    this.state = 'ready';
    if (this.timeline) {
      this.timeline.state = 'stopped';
      this.timeline.startPositionSec = 0;
    }
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
    if (this.timeline && this.timeline.state === 'playing') {
      const serverNow = timeSync.getServerTime();
      return calculateTimelinePositionSec(this.timeline, serverNow);
    }
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
