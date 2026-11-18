import React, { useState, useRef } from 'react';
import {
  AudioTrackMetadata,
  DeviceInfo,
  formatAudioTime,
  formatTimeMs,
  evaluateSyncQuality,
} from '@echocast/shared';
import {
  Play,
  Pause,
  Square,
  Volume2,
  VolumeX,
  Upload,
  Music,
  Radio,
  Zap,
  Laptop,
  Smartphone,
  Headphones,
  Speaker,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { AudioVisualizer } from '../common/AudioVisualizer';
import { wsClient } from '../../core/network/wsClient';

interface Props {
  currentTrack: AudioTrackMetadata | null;
  tracks: AudioTrackMetadata[];
  isPlaying: boolean;
  positionSec: number;
  durationSec: number;
  volume: number;
  isMuted: boolean;
  receivers: DeviceInfo[];
  onPlay: (startPos?: number) => void;
  onPause: () => void;
  onSeek: (targetPos: number) => void;
  onStop: () => void;
  onVolumeChange: (vol: number) => void;
  onMuteToggle: () => void;
  onSelectTrack: (trackId: string) => void;
  onRefreshTracks: () => void;
  onRemoteVolume: (deviceId: string, vol: number) => void;
  onRemoteMute: (deviceId: string, isMuted: boolean) => void;
}

export const SenderDashboard: React.FC<Props> = ({
  currentTrack,
  tracks,
  isPlaying,
  positionSec,
  durationSec,
  volume,
  isMuted,
  receivers,
  onPlay,
  onPause,
  onSeek,
  onStop,
  onVolumeChange,
  onMuteToggle,
  onSelectTrack,
  onRefreshTracks,
  onRemoteVolume,
  onRemoteMute,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const effectiveDuration = durationSec > 0 ? durationSec : (currentTrack?.durationSec || 1);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append('audio', file);

    try {
      const res = await fetch('/api/audio/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Upload failed');
      }

      const newTrack: AudioTrackMetadata = await res.json();
      onRefreshTracks();
      onSelectTrack(newTrack.id);
    } catch (err: any) {
      setUploadError(err.message || 'Failed to upload audio file');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleTestPulse = () => {
    wsClient.send({
      type: 'TEST_PULSE_PLAY',
      payload: {
        scheduledServerTime: 0, // Server schedules future timestamp
        frequencyHz: 1000,
        durationMs: 70,
      },
      timestamp: Date.now(),
    });
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'android':
      case 'ios':
        return Smartphone;
      default:
        return Laptop;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Mode Overview */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-brand-950 via-slate-900 to-slate-900 border border-brand-500/30 shadow-xl">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-brand-500/20 text-brand-300 text-xs font-semibold uppercase tracking-wider mb-2">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            <span>Master Broadcast Node</span>
          </div>
          <h2 className="text-xl font-bold text-white">EchoCast Sender Console</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Streaming audio to {receivers.length} synchronized local receiver(s) over Wi-Fi / Hotspot.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleTestPulse}
            className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-500 text-white font-semibold text-xs rounded-xl shadow-lg transition active:scale-95"
            title="Broadcast a sharp 1kHz test beep to hear alignment across all devices"
          >
            <Zap className="w-4 h-4 text-amber-300" />
            <span>Broadcast 1kHz Sync Click</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Player on left, Track Selector on right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Player & Controls (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
            {/* Current Track Info */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 shrink-0">
                  <Music className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white truncate max-w-xs sm:max-w-md">
                    {currentTrack?.title || 'No Track Selected'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {currentTrack?.artist || 'EchoCast Sync Audio Engine'} •{' '}
                    <span className="font-mono uppercase">{currentTrack?.format || 'WAV'}</span>
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold uppercase font-mono bg-slate-800 text-slate-300 border border-slate-700">
                  {isPlaying ? 'Broadcasting' : 'Ready'}
                </span>
              </div>
            </div>

            {/* Visualizer Canvas */}
            <AudioVisualizer isActive={isPlaying} height={60} />

            {/* Scrub Bar */}
            <div className="space-y-1.5">
              <div className="relative flex items-center">
                <input
                  type="range"
                  min={0}
                  max={effectiveDuration}
                  step={0.1}
                  value={positionSec}
                  onChange={(e) => onSeek(parseFloat(e.target.value))}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-brand-500"
                />
              </div>
              <div className="flex justify-between text-xs font-mono text-slate-400">
                <span>{formatAudioTime(positionSec)}</span>
                <span>{formatAudioTime(effectiveDuration)}</span>
              </div>
            </div>

            {/* Transport Controls */}
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => onSeek(0)}
                  className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                  title="Restart Track"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>

                <button
                  onClick={() => (isPlaying ? onPause() : onPlay())}
                  className="w-14 h-14 rounded-2xl bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white flex items-center justify-center shadow-lg shadow-brand-500/25 transition active:scale-95"
                  title={isPlaying ? 'Pause Broadcast' : 'Start Synchronized Playback'}
                >
                  {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-0.5" />}
                </button>

                <button
                  onClick={onStop}
                  className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                  title="Stop Playback"
                >
                  <Square className="w-4 h-4" />
                </button>
              </div>

              {/* Volume Slider */}
              <div className="flex items-center gap-2.5 bg-slate-950/60 px-3 py-2 rounded-xl border border-slate-800">
                <button
                  onClick={onMuteToggle}
                  className="text-slate-400 hover:text-white transition"
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-4 h-4 text-rose-400" />
                  ) : (
                    <Volume2 className="w-4 h-4 text-brand-400" />
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                  className="w-20 sm:w-28 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-brand-500"
                />
                <span className="text-xs font-mono text-slate-400 w-8 text-right">
                  {Math.round((isMuted ? 0 : volume) * 100)}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Audio Tracks & Upload (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Music className="w-4 h-4 text-brand-400" />
                <span>Audio Library</span>
              </h3>

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold shadow transition disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{isUploading ? 'Uploading...' : 'Upload Audio'}</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,.mp3,.wav,.ogg,.aac,.flac"
                className="hidden"
                onChange={handleFileUpload}
              />
            </div>

            {uploadError && (
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            {/* Tracks List */}
            <div className="space-y-2 max-h-[310px] overflow-y-auto pr-1">
              {tracks.map((track) => {
                const isSelected = currentTrack?.id === track.id;
                const isTestTrack = track.id === 'test-metronome-sync';

                return (
                  <div
                    key={track.id}
                    onClick={() => onSelectTrack(track.id)}
                    className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition ${
                      isSelected
                        ? 'bg-brand-500/15 border-brand-500/50 text-white'
                        : 'bg-slate-800/40 border-slate-800 hover:bg-slate-800/80 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          isSelected ? 'bg-brand-600 text-white' : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {isTestTrack ? <Zap className="w-4 h-4 text-amber-300" /> : <Music className="w-4 h-4" />}
                      </div>
                      <div className="truncate">
                        <div className="font-semibold text-xs truncate flex items-center gap-1.5">
                          <span className="truncate">{track.title}</span>
                          {isTestTrack && (
                            <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded font-mono shrink-0">
                              Calibration Beat
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] opacity-70 font-mono">
                          {formatAudioTime(track.durationSec)} • {track.format.toUpperCase()}
                        </div>
                      </div>
                    </div>

                    {isSelected && (
                      <span className="text-xs font-semibold text-brand-400 flex items-center gap-1 shrink-0 font-mono">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Active</span>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Connected Receivers Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Speaker className="w-5 h-5 text-brand-400" />
              <span>Connected Receivers ({receivers.length})</span>
            </h3>
            <p className="text-xs text-slate-400">
              Live status, clock offsets, and remote volume control for connected devices.
            </p>
          </div>

          <div className="text-xs font-mono text-slate-400 bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800">
            Target Sync Precision: <span className="text-emerald-400 font-bold">&lt; 10ms</span>
          </div>
        </div>

        {receivers.length === 0 ? (
          <div className="text-center py-12 px-4 rounded-xl border border-dashed border-slate-800 bg-slate-950/40">
            <Smartphone className="w-10 h-10 mx-auto text-slate-600 mb-2" />
            <h4 className="text-sm font-semibold text-slate-300">No Receivers Connected Yet</h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
              Connect phones or laptops to this Wi-Fi / Hotspot and scan the QR code to join synchronized playback.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {receivers.map((device) => {
              const PlatformIcon = getPlatformIcon(device.platform);
              const quality = evaluateSyncQuality(device.clockOffsetMs, device.roundTripTimeMs);
              const isExcellent = quality === 'excellent';

              return (
                <div
                  key={device.id}
                  className="bg-slate-800/40 border border-slate-800 rounded-xl p-4 space-y-3 hover:border-slate-700 transition"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center text-brand-400">
                        <PlatformIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white">{device.name}</h4>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                          <span className="capitalize">{device.platform}</span>
                          <span>•</span>
                          <span className="capitalize flex items-center gap-1">
                            {device.outputType === 'bluetooth' ? (
                              <Headphones className="w-3 h-3 text-cyan-400" />
                            ) : (
                              <Speaker className="w-3 h-3 text-brand-400" />
                            )}
                            {device.outputType}
                          </span>
                        </div>
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase font-mono ${
                        isExcellent
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}
                    >
                      {quality}
                    </span>
                  </div>

                  {/* Sync Metrics */}
                  <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
                    <div>
                      <span className="text-slate-500 block">Clock Offset:</span>
                      <span className="font-semibold text-slate-200">{formatTimeMs(device.clockOffsetMs)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">RTT Latency:</span>
                      <span className="font-semibold text-slate-200">{formatTimeMs(device.roundTripTimeMs)}</span>
                    </div>
                  </div>

                  {/* Remote Volume & Mute */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2 flex-1 mr-2">
                      <button
                        onClick={() => onRemoteMute(device.id, !device.isMuted)}
                        className="text-slate-400 hover:text-white transition"
                        title={device.isMuted ? 'Unmute Receiver' : 'Mute Receiver'}
                      >
                        {device.isMuted ? (
                          <VolumeX className="w-4 h-4 text-rose-400" />
                        ) : (
                          <Volume2 className="w-4 h-4 text-slate-300" />
                        )}
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.02}
                        value={device.isMuted ? 0 : device.volume}
                        onChange={(e) => onRemoteVolume(device.id, parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-brand-500"
                      />
                    </div>
                    <span className="text-xs font-mono text-slate-400 w-8 text-right">
                      {Math.round((device.isMuted ? 0 : device.volume) * 100)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
