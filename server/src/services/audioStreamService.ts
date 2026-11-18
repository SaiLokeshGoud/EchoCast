import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';
import {
  AudioTrackMetadata,
  BroadcastState,
  PlayCommandPayload,
  PauseCommandPayload,
  SeekCommandPayload,
} from '@echocast/shared';
import { config } from '../config/index';
import { syncEngine } from './syncEngineService';
import { logger } from '../utils/logger';

const audioLogger = logger.forContext('AudioStreamService');

export class AudioStreamService {
  private tracks: Map<string, AudioTrackMetadata> = new Map();
  private playlistTrackIds: string[] = [];
  private broadcastState: BroadcastState;
  private testWavBuffer: Buffer | null = null;

  constructor() {
    this.broadcastState = {
      currentTrack: null,
      playbackState: 'idle',
      isPlaying: false,
      positionSec: 0,
      referenceServerTime: syncEngine.getServerTime(),
      volume: 1.0,
      loop: false,
      autoplay: true,
      playlist: [],
      isRoomActive: true,
      roomId: 'CAST-842',
      generation: 1,
    };

    // Generate built-in sync calibration metronome track
    this.initBuiltinTestTrack();
    this.scanUploadsDirectory();
  }

  /**
   * Generates a 12-second high-precision sync calibration audio WAV buffer.
   * Produces rhythmic clicks, stereo pulses, and frequency sweeps for audible sync alignment verification.
   */
  private initBuiltinTestTrack() {
    try {
      const sampleRate = 44100;
      const durationSec = 12;
      const numSamples = sampleRate * durationSec;
      const bpm = 120; // 2 beats per second (500ms per beat)
      const samplesPerBeat = Math.floor(sampleRate * (60 / bpm));

      const pcmData = new Int16Array(numSamples);

      for (let i = 0; i < numSamples; i++) {
        const beatIndex = Math.floor(i / samplesPerBeat);
        const sampleInBeat = i % samplesPerBeat;
        const timeInBeat = sampleInBeat / sampleRate;

        let sampleVal = 0;

        // On every beat: sharp click (50ms duration)
        if (timeInBeat < 0.05) {
          const isBar = beatIndex % 4 === 0;
          const freq = isBar ? 1500 : 800;
          const envelope = Math.exp(-timeInBeat * 60);
          sampleVal = Math.sin(2 * Math.PI * freq * timeInBeat) * envelope * 0.85;
        }

        // Sub-bass thump on beat 1 of each 4-beat bar (150ms)
        if (beatIndex % 4 === 0 && timeInBeat < 0.15) {
          const bassEnvelope = Math.exp(-timeInBeat * 25);
          sampleVal += Math.sin(2 * Math.PI * 65 * timeInBeat) * bassEnvelope * 0.7;
        }

        const clamped = Math.max(-1, Math.min(1, sampleVal));
        pcmData[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
      }

      // Build standard 44-byte RIFF WAV Header (Mono, 16-bit, 44100Hz)
      const dataSize = pcmData.length * 2;
      const headerBuffer = Buffer.alloc(44);

      headerBuffer.write('RIFF', 0);
      headerBuffer.writeUInt32LE(36 + dataSize, 4);
      headerBuffer.write('WAVE', 8);
      headerBuffer.write('fmt ', 12);
      headerBuffer.writeUInt32LE(16, 16);
      headerBuffer.writeUInt16LE(1, 20);
      headerBuffer.writeUInt16LE(1, 22);
      headerBuffer.writeUInt32LE(sampleRate, 24);
      headerBuffer.writeUInt32LE(sampleRate * 2, 28);
      headerBuffer.writeUInt16LE(2, 32);
      headerBuffer.writeUInt16LE(16, 34);
      headerBuffer.write('data', 36);
      headerBuffer.writeUInt32LE(dataSize, 40);

      const pcmBuffer = Buffer.from(pcmData.buffer);
      this.testWavBuffer = Buffer.concat([headerBuffer, pcmBuffer]);

      const testTrack: AudioTrackMetadata = {
        id: 'test-metronome-sync',
        title: 'EchoCast Sync Calibration Beat',
        artist: 'EchoCast Built-in Engine',
        durationSec: durationSec,
        url: '/api/audio/stream/test-metronome-sync',
        sourceType: 'tone',
        format: 'wav',
        sizeBytes: this.testWavBuffer.length,
        sampleRate: sampleRate,
        channels: 1,
        addedAt: Date.now(),
      };

      this.tracks.set(testTrack.id, testTrack);
      if (!this.playlistTrackIds.includes(testTrack.id)) {
        this.playlistTrackIds.push(testTrack.id);
      }
      this.broadcastState.currentTrack = testTrack;
      this.syncPlaylistToState();
      audioLogger.info(`Built-in sync metronome WAV generated successfully (${(this.testWavBuffer.length / 1024).toFixed(1)} KB).`);
    } catch (err) {
      audioLogger.error('Failed to generate built-in WAV buffer', err);
    }
  }

  /**
   * Scan upload directory on startup for existing tracks
   */
  private scanUploadsDirectory() {
    try {
      if (!fs.existsSync(config.uploadDir)) return;
      const files = fs.readdirSync(config.uploadDir);

      for (const file of files) {
        const filePath = path.join(config.uploadDir, file);
        const stat = fs.statSync(filePath);
        if (stat.isFile() && !file.startsWith('.')) {
          const ext = path.extname(file).toLowerCase().replace('.', '');
          const trackId = `track-${Buffer.from(file).toString('base64url')}`;

          const track: AudioTrackMetadata = {
            id: trackId,
            title: path.basename(file, path.extname(file)),
            artist: 'Local Upload',
            url: `/api/audio/stream/${trackId}`,
            sourceType: 'file',
            format: (['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a'].includes(ext) ? ext : 'mp3') as any,
            sizeBytes: stat.size,
            durationSec: 180,
            addedAt: stat.birthtimeMs || Date.now(),
          };

          this.tracks.set(trackId, track);
          if (!this.playlistTrackIds.includes(trackId)) {
            this.playlistTrackIds.push(trackId);
          }
        }
      }
      this.syncPlaylistToState();
      audioLogger.info(`Scanned uploads directory: ${this.tracks.size} tracks available.`);
    } catch (err) {
      audioLogger.error('Error scanning uploads directory', err);
    }
  }

  private syncPlaylistToState() {
    const list: AudioTrackMetadata[] = [];
    for (const id of this.playlistTrackIds) {
      const t = this.tracks.get(id);
      if (t) list.push(t);
    }
    this.broadcastState.playlist = list;
  }

  public getAllTracks(): AudioTrackMetadata[] {
    return Array.from(this.tracks.values());
  }

  public getPlaylist(): AudioTrackMetadata[] {
    return this.broadcastState.playlist;
  }

  public getTrack(trackId: string): AudioTrackMetadata | undefined {
    return this.tracks.get(trackId);
  }

  public addUploadedTrack(metadata: AudioTrackMetadata) {
    this.tracks.set(metadata.id, metadata);
    if (!this.playlistTrackIds.includes(metadata.id)) {
      this.playlistTrackIds.push(metadata.id);
    }
    this.syncPlaylistToState();
    audioLogger.info(`New track added: ${metadata.title} (${metadata.id})`);
  }

  public removeTrack(trackId: string): boolean {
    // If it's an uploaded file on disk, delete it
    if (trackId !== 'test-metronome-sync') {
      try {
        const files = fs.readdirSync(config.uploadDir);
        const targetFile = files.find((f) => `track-${Buffer.from(f).toString('base64url')}` === trackId);
        if (targetFile) {
          fs.unlinkSync(path.join(config.uploadDir, targetFile));
          audioLogger.info(`Deleted file from disk: ${targetFile}`);
        }
      } catch (err) {
        audioLogger.warn(`Could not delete file for track ${trackId}:`, err);
      }
    }

    this.tracks.delete(trackId);
    this.playlistTrackIds = this.playlistTrackIds.filter((id) => id !== trackId);
    this.syncPlaylistToState();

    // If active track was removed, pick next track
    if (this.broadcastState.currentTrack?.id === trackId) {
      const nextTrack = this.broadcastState.playlist[0] || null;
      this.broadcastState.currentTrack = nextTrack;
      this.broadcastState.positionSec = 0;
      this.broadcastState.isPlaying = false;
      this.broadcastState.playbackState = 'idle';
      this.broadcastState.generation += 1;
    }

    return true;
  }

  public setPlaylistOrder(trackIds: string[]) {
    this.playlistTrackIds = trackIds.filter((id) => this.tracks.has(id));
    this.syncPlaylistToState();
    audioLogger.info(`Updated playlist order (${this.playlistTrackIds.length} tracks)`);
  }

  public updateTrackMetadata(trackId: string, durationSec: number, artist?: string, album?: string) {
    const track = this.tracks.get(trackId);
    if (track) {
      if (durationSec > 0) track.durationSec = durationSec;
      if (artist) track.artist = artist;
      if (album) track.album = album;
      this.tracks.set(trackId, track);

      if (this.broadcastState.currentTrack?.id === trackId) {
        this.broadcastState.currentTrack = { ...track };
      }
      this.syncPlaylistToState();
    }
  }

  public setAutoplay(autoplay: boolean) {
    this.broadcastState.autoplay = autoplay;
  }

  public setLoop(loop: boolean) {
    this.broadcastState.loop = loop;
  }

  public setRoomState(isRoomActive: boolean, roomId?: string) {
    this.broadcastState.isRoomActive = isRoomActive;
    if (roomId) this.broadcastState.roomId = roomId;
    if (!isRoomActive) {
      this.stop();
    }
    audioLogger.info(`Room state updated: active=${isRoomActive}, roomId=${this.broadcastState.roomId}`);
  }

  public nextTrack(): AudioTrackMetadata | null {
    if (this.broadcastState.playlist.length === 0) return null;
    const currentIndex = this.broadcastState.playlist.findIndex((t) => t.id === this.broadcastState.currentTrack?.id);
    const nextIndex = currentIndex < this.broadcastState.playlist.length - 1 ? currentIndex + 1 : 0;
    const next = this.broadcastState.playlist[nextIndex];
    if (next) {
      this.setTrack(next.id);
      return next;
    }
    return null;
  }

  public previousTrack(): AudioTrackMetadata | null {
    if (this.broadcastState.playlist.length === 0) return null;
    const currentIndex = this.broadcastState.playlist.findIndex((t) => t.id === this.broadcastState.currentTrack?.id);
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : this.broadcastState.playlist.length - 1;
    const prev = this.broadcastState.playlist[prevIndex];
    if (prev) {
      this.setTrack(prev.id);
      return prev;
    }
    return null;
  }

  public getBroadcastState(): BroadcastState {
    if (this.broadcastState.isPlaying && this.broadcastState.currentTrack) {
      const serverNow = syncEngine.getServerTime();
      const elapsedSec = (serverNow - this.broadcastState.referenceServerTime) / 1000;
      let calculatedPos = this.broadcastState.positionSec + elapsedSec;

      if (this.broadcastState.currentTrack.durationSec > 0) {
        if (calculatedPos >= this.broadcastState.currentTrack.durationSec) {
          if (this.broadcastState.loop) {
            calculatedPos = calculatedPos % this.broadcastState.currentTrack.durationSec;
          } else if (this.broadcastState.autoplay && this.broadcastState.playlist.length > 1) {
            // Autoplay next track
            const next = this.nextTrack();
            if (next) {
              this.play(0);
              return this.getBroadcastState();
            }
          } else {
            calculatedPos = this.broadcastState.currentTrack.durationSec;
            this.broadcastState.isPlaying = false;
            this.broadcastState.playbackState = 'stopped';
          }
        }
      }
      return {
        ...this.broadcastState,
        positionSec: Math.max(0, calculatedPos),
      };
    }

    return { ...this.broadcastState };
  }

  public setTrack(trackId: string): AudioTrackMetadata | null {
    const track = this.tracks.get(trackId);
    if (!track) return null;

    this.broadcastState.currentTrack = track;
    this.broadcastState.positionSec = 0;
    this.broadcastState.isPlaying = false;
    this.broadcastState.playbackState = 'ready';
    this.broadcastState.referenceServerTime = syncEngine.getServerTime();
    this.broadcastState.generation += 1;

    audioLogger.info(`Current track set to: ${track.title} (${track.id})`);
    return track;
  }

  public play(startPositionSec?: number, delayMs: number = config.defaultScheduleDelayMs): PlayCommandPayload | null {
    if (!this.broadcastState.currentTrack) return null;

    const scheduledServerTime = syncEngine.calculateScheduledTime(delayMs);
    const pos = startPositionSec !== undefined ? startPositionSec : this.getBroadcastState().positionSec;

    this.broadcastState.isPlaying = true;
    this.broadcastState.playbackState = 'playing';
    this.broadcastState.positionSec = pos;
    this.broadcastState.referenceServerTime = scheduledServerTime;
    this.broadcastState.scheduledStartTime = scheduledServerTime;
    this.broadcastState.generation += 1;

    audioLogger.info(`Playback scheduled: track=${this.broadcastState.currentTrack.title}, pos=${pos.toFixed(2)}s, at serverTime=${scheduledServerTime}`);

    return {
      trackId: this.broadcastState.currentTrack.id,
      scheduledServerTime,
      startPositionSec: pos,
      generation: this.broadcastState.generation,
    };
  }

  public pause(): PauseCommandPayload | null {
    if (!this.broadcastState.currentTrack) return null;

    const currentState = this.getBroadcastState();
    const scheduledServerTime = syncEngine.getServerTime();

    this.broadcastState.isPlaying = false;
    this.broadcastState.playbackState = 'paused';
    this.broadcastState.positionSec = currentState.positionSec;
    this.broadcastState.referenceServerTime = scheduledServerTime;
    this.broadcastState.generation += 1;

    audioLogger.info(`Playback paused at pos=${currentState.positionSec.toFixed(2)}s`);

    return {
      scheduledServerTime,
      pausePositionSec: currentState.positionSec,
      generation: this.broadcastState.generation,
    };
  }

  public seek(targetPositionSec: number, delayMs: number = config.defaultScheduleDelayMs): SeekCommandPayload | null {
    if (!this.broadcastState.currentTrack) return null;

    const scheduledServerTime = syncEngine.calculateScheduledTime(delayMs);

    this.broadcastState.positionSec = targetPositionSec;
    this.broadcastState.referenceServerTime = scheduledServerTime;
    this.broadcastState.scheduledStartTime = scheduledServerTime;
    this.broadcastState.generation += 1;

    audioLogger.info(`Seek scheduled: target=${targetPositionSec.toFixed(2)}s, at serverTime=${scheduledServerTime}`);

    return {
      trackId: this.broadcastState.currentTrack.id,
      scheduledServerTime,
      targetPositionSec,
      generation: this.broadcastState.generation,
    };
  }

  public stop(): number {
    this.broadcastState.isPlaying = false;
    this.broadcastState.playbackState = 'stopped';
    this.broadcastState.positionSec = 0;
    this.broadcastState.referenceServerTime = syncEngine.getServerTime();
    this.broadcastState.generation += 1;
    return this.broadcastState.generation;
  }

  public setVolume(volume: number) {
    this.broadcastState.volume = Math.max(0, Math.min(1, volume));
  }

  /**
   * HTTP Stream Handler: handles byte-range requests and stream delivery
   */
  public handleStreamRequest(req: Request, res: Response, trackId: string) {
    if (trackId === 'test-metronome-sync') {
      if (!this.testWavBuffer) {
        res.status(500).json({ error: 'Test buffer not initialized' });
        return;
      }

      const totalSize = this.testWavBuffer.length;
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

        if (start >= totalSize) {
          res.status(416).send(`Requested range not satisfiable: ${start} >= ${totalSize}`);
          return;
        }

        const chunk = this.testWavBuffer.subarray(start, end + 1);
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${totalSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunk.length,
          'Content-Type': 'audio/wav',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(chunk);
        return;
      }

      res.writeHead(200, {
        'Content-Type': 'audio/wav',
        'Content-Length': this.testWavBuffer.length,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(this.testWavBuffer);
      return;
    }

    const track = this.tracks.get(trackId);
    if (!track) {
      res.status(404).json({ error: 'Track not found' });
      return;
    }

    const files = fs.readdirSync(config.uploadDir);
    const targetFile = files.find((f) => `track-${Buffer.from(f).toString('base64url')}` === trackId);

    if (!targetFile) {
      res.status(404).json({ error: 'File on disk not found' });
      return;
    }

    const filePath = path.join(config.uploadDir, targetFile);
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    const mimeTypes: Record<string, string> = {
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      ogg: 'audio/ogg',
      aac: 'audio/aac',
      flac: 'audio/flac',
      weba: 'audio/webm',
      m4a: 'audio/mp4',
      opus: 'audio/opus',
    };
    const contentType = mimeTypes[track.format] || 'audio/mpeg';

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize) {
        res.status(416).send(`Requested range not satisfiable: ${start} >= ${fileSize}`);
        return;
      }

      const chunkSize = end - start + 1;
      const fileStream = fs.createReadStream(filePath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
      });

      fileStream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
      });
      fs.createReadStream(filePath).pipe(res);
    }
  }
}

export const audioStreamService = new AudioStreamService();
