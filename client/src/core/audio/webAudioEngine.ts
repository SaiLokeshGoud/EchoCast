import { AudioTrackMetadata, DeviceAudioOutput } from '@echocast/shared';
import { timeSync } from '../sync/timeSync';

export type AudioEngineState = 'unlocked' | 'locked' | 'buffering' | 'ready' | 'playing' | 'paused' | 'error';
export type AudioEngineListener = () => void;

export class WebAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private currentSourceNode: AudioBufferSourceNode | null = null;

  private currentTrack: AudioTrackMetadata | null = null;
  private audioBufferCache: Map<string, AudioBuffer> = new Map();
  private activeBuffer: AudioBuffer | null = null;

  private state: AudioEngineState = 'locked';
  private bufferProgress: number = 0;
  private volume: number = 1.0;
  private isMuted: boolean = false;
  private outputType: DeviceAudioOutput = 'speaker';
  private manualOffsetMs: number = 0;
  private currentGeneration: number = 0;
  private playbackStartTimeSec: number = 0; // audioContext time when playback began
  private trackOffsetSec: number = 0;       // track position when started
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

    if (this.audioBufferCache.has(track.id)) {
      this.activeBuffer = this.audioBufferCache.get(track.id)!;
      this.bufferProgress = 100;
      this.state = this.isUnlocked() ? 'ready' : 'locked';
      this.notify();
      return this.activeBuffer;
    }

    this.state = 'buffering';
    this.bufferProgress = 5;
    this.notify();

    try {
      const response = await fetch(track.url);
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status} fetching audio stream`);
      }

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

      this.audioBufferCache.set(track.id, decodedBuffer);
      this.activeBuffer = decodedBuffer;
      this.bufferProgress = 100;
      this.state = this.isUnlocked() ? 'ready' : 'locked';
      this.notify();
      return decodedBuffer;
    } catch (err) {
      console.error(`Failed to load and decode track ${track.title}`, err);
      this.state = 'error';
      this.bufferProgress = 0;
      this.notify();
      return null;
    }
  }

  /**
   * Synchronized Playback: schedules AudioBufferSourceNode at exact target Web Audio clock.
   * Avoids unnecessary playback restarts when already in sync.
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

      // If drift is small (45ms to 120ms), gently adjust playback rate without audible restart
      if (driftSec < 0.120 && this.ctx) {
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

    // Calculate time remaining until scheduled server time
    const timeDeltaMs = scheduledServerTime - currentServerTime;

    // Apply latency compensation (NTP roundtrip/2 + hardware latency + bluetooth/manual offset)
    const effectiveLatencyMs = timeSync.getMetrics().effectiveTotalLatencyMs;
    const adjustedDeltaSec = (timeDeltaMs - effectiveLatencyMs) / 1000;

    // Convert to Web Audio context timestamp
    const targetAudioContextTime = Math.max(ctx.currentTime, ctx.currentTime + adjustedDeltaSec);

    // Guard against position out of bounds
    const safeOffset = Math.max(0, Math.min(startPositionSec, this.activeBuffer.duration - 0.05));

    const source = ctx.createBufferSource();
    source.buffer = this.activeBuffer;
    source.connect(this.masterGain!);

    source.onended = () => {
      if (this.currentSourceNode === source) {
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
    this.state = 'playing';

    this.requestWakeLock();
    this.updateMediaSession(this.currentTrack, true);
    this.notify();
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
    if (this.currentSourceNode) {
      try {
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
