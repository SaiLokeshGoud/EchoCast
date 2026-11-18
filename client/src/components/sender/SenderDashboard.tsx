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
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Upload,
  Music,
  Zap,
  RotateCcw,
  QrCode,
  Copy,
  Check,
  Disc,
  Users,
  Wifi,
  Smartphone,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { AudioVisualizer } from '../common/AudioVisualizer';
import { wsClient } from '../../core/network/wsClient';

interface Props {
  roomId: string;
  onUpdateRoomId: (newRoomId: string) => void;
  onOpenQrModal: () => void;
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
  onPreviousTrack: () => void;
  onNextTrack: () => void;
  onVolumeChange: (vol: number) => void;
  onMuteToggle: () => void;
  onSelectTrack: (trackId: string) => void;
  onRefreshTracks: () => void;
  onRemoteVolume: (deviceId: string, vol: number) => void;
  onRemoteMute: (deviceId: string, isMuted: boolean) => void;
  onNavigateToDevices: () => void;
  primaryUrl: string;
  isHotspotDetected: boolean;
}

export const SenderDashboard: React.FC<Props> = ({
  roomId,
  onUpdateRoomId,
  onOpenQrModal,
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
  onPreviousTrack,
  onNextTrack,
  onVolumeChange,
  onMuteToggle,
  onSelectTrack,
  onRefreshTracks,
  onRemoteVolume: _onRemoteVolume,
  onRemoteMute: _onRemoteMute,
  onNavigateToDevices,
  primaryUrl,
  isHotspotDetected,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [copiedRoom, setCopiedRoom] = useState(false);
  const [isEditingRoom, setIsEditingRoom] = useState(false);
  const [customRoomInput, setCustomRoomInput] = useState(roomId);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const effectiveDuration = durationSec > 0 ? durationSec : (currentTrack?.durationSec || 1);

  const handleCopyRoom = () => {
    navigator.clipboard.writeText(roomId);
    setCopiedRoom(true);
    setTimeout(() => setCopiedRoom(false), 2000);
  };

  const handleSaveRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (customRoomInput.trim()) {
      onUpdateRoomId(customRoomInput.trim().toUpperCase());
      setIsEditingRoom(false);
    }
  };

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
        scheduledServerTime: 0,
        frequencyHz: 1000,
        durationMs: 70,
      },
      timestamp: Date.now(),
    });
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-8">
      {/* Top Room & Network Status Bar */}
      <div className="bg-charcoal-900 border border-charcoal-750 rounded-2xl p-5 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Room ID and QR Area */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Room:</span>
            {isEditingRoom ? (
              <form onSubmit={handleSaveRoom} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={customRoomInput}
                  onChange={(e) => setCustomRoomInput(e.target.value)}
                  maxLength={16}
                  className="px-2 py-1 bg-charcoal-850 border border-charcoal-700 rounded-lg text-xs font-mono font-bold text-brand-400 uppercase focus:outline-none focus:border-brand-500 w-28"
                  autoFocus
                />
                <button
                  type="submit"
                  className="px-2 py-1 bg-brand-500 text-charcoal-950 rounded-lg text-xs font-bold"
                >
                  Save
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-1.5 bg-charcoal-850 border border-charcoal-750 px-3 py-1.5 rounded-xl font-mono text-sm font-bold text-brand-400">
                <span>{roomId}</span>
                <button
                  onClick={handleCopyRoom}
                  className="text-slate-400 hover:text-white transition ml-1"
                  title="Copy Room Code"
                >
                  {copiedRoom ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            )}
          </div>

          {!isEditingRoom && (
            <button
              onClick={() => {
                setCustomRoomInput(roomId);
                setIsEditingRoom(true);
              }}
              className="text-xs text-slate-400 hover:text-white transition font-medium"
            >
              Change Room
            </button>
          )}

          <div className="h-4 w-px bg-charcoal-750 hidden sm:block" />

          {/* QR Code Launcher */}
          <button
            onClick={onOpenQrModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-charcoal-850 hover:bg-charcoal-800 border border-charcoal-750 text-xs text-slate-300 font-medium transition"
          >
            <QrCode className="w-3.5 h-3.5 text-cyanAccent-400" />
            <span>Show Room QR</span>
          </button>
        </div>

        {/* Network & Connected Receiver Count */}
        <div className="flex items-center gap-3 self-start md:self-auto">
          <div
            onClick={onNavigateToDevices}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-charcoal-850 border border-charcoal-750 text-xs font-mono cursor-pointer hover:bg-charcoal-800 transition"
            title="View connected devices"
          >
            <Users className="w-3.5 h-3.5 text-brand-400" />
            <span className="text-slate-400">Receivers:</span>
            <span className="text-white font-bold">{receivers.length}</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-charcoal-850 border border-charcoal-750 text-xs font-mono text-slate-400">
            <Wifi className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden lg:inline">{primaryUrl.replace(/^https?:\/\//, '')}</span>
            <span className="text-emerald-400 font-bold ml-1">
              {isHotspotDetected ? 'Hotspot' : 'Wi-Fi'}
            </span>
          </div>

          <button
            onClick={handleTestPulse}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-charcoal-800 hover:bg-charcoal-750 border border-charcoal-700 text-xs text-amber-300 font-medium transition"
            title="Broadcast a 1kHz click to hear speaker alignment"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Sync Click</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Player on left, Track Library on right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Player Console & Album Artwork (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-charcoal-900 border border-charcoal-750 rounded-2xl p-6 shadow-xl space-y-6">
            {/* Album Artwork & Track Info Header */}
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
              {/* Modern Vinyl Album Artwork Area */}
              <div className="relative group shrink-0">
                <div
                  className={`w-28 h-28 sm:w-32 sm:h-32 rounded-2xl bg-charcoal-850 border border-charcoal-700 flex items-center justify-center shadow-lg overflow-hidden transition-all duration-300 ${
                    isPlaying ? 'ring-2 ring-brand-500/40' : ''
                  }`}
                >
                  <div className="w-full h-full bg-gradient-to-br from-charcoal-800 to-navy-950 flex flex-col items-center justify-center p-3 text-center relative">
                    <Disc
                      className={`w-14 h-14 text-slate-600 transition-transform duration-700 ${
                        isPlaying ? 'animate-spin text-brand-500' : ''
                      }`}
                      style={{ animationDuration: '4s' }}
                    />
                    <div className="absolute inset-0 bg-charcoal-950/20 pointer-events-none" />
                  </div>
                </div>
                {isPlaying && (
                  <span className="absolute bottom-1 right-1 w-3.5 h-3.5 rounded-full bg-brand-500 ring-2 ring-charcoal-900 animate-pulse" />
                )}
              </div>

              {/* Title & Metadata */}
              <div className="flex-1 text-center sm:text-left min-w-0 space-y-1.5">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-charcoal-850 border border-charcoal-700 text-[10px] font-mono font-bold text-brand-400 uppercase">
                  {isPlaying ? 'Broadcasting Now' : 'Stream Standby'}
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight truncate">
                  {currentTrack?.title || 'No Track Loaded'}
                </h3>
                <p className="text-xs text-slate-400 font-medium truncate">
                  {currentTrack?.artist || 'EchoCast Synchronized Engine'}
                </p>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1 text-[11px] font-mono text-slate-400">
                  <span className="px-2 py-0.5 bg-charcoal-850 rounded border border-charcoal-750 uppercase">
                    {currentTrack?.format || 'WAV'}
                  </span>
                  <span>•</span>
                  <span>{formatAudioTime(effectiveDuration)}</span>
                  <span>•</span>
                  <span className="text-slate-500">44.1 kHz PCM</span>
                </div>
              </div>
            </div>

            {/* Visualizer Waveform */}
            <AudioVisualizer isActive={isPlaying} height={52} barCount={34} />

            {/* Scrub Progress Bar */}
            <div className="space-y-1.5">
              <input
                type="range"
                min={0}
                max={effectiveDuration}
                step={0.1}
                value={positionSec}
                onChange={(e) => onSeek(parseFloat(e.target.value))}
                className="w-full h-2 bg-charcoal-800 rounded-lg appearance-none cursor-pointer accent-brand-500"
              />
              <div className="flex justify-between text-xs font-mono text-slate-400">
                <span>{formatAudioTime(positionSec)}</span>
                <span>{formatAudioTime(effectiveDuration)}</span>
              </div>
            </div>

            {/* Master Transport Controls */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-1">
              <div className="flex items-center gap-3">
                {/* Previous Track */}
                <button
                  onClick={onPreviousTrack}
                  className="p-3 rounded-xl bg-charcoal-850 hover:bg-charcoal-800 border border-charcoal-750 text-slate-300 transition active:scale-95"
                  title="Previous Track"
                >
                  <SkipBack className="w-4 h-4" />
                </button>

                {/* Restart */}
                <button
                  onClick={() => onSeek(0)}
                  className="p-3 rounded-xl bg-charcoal-850 hover:bg-charcoal-800 border border-charcoal-750 text-slate-300 transition active:scale-95"
                  title="Restart Track (00:00)"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>

                {/* Big Center Play / Pause */}
                <button
                  onClick={() => (isPlaying ? onPause() : onPlay())}
                  className="w-14 h-14 rounded-2xl bg-brand-500 hover:bg-brand-600 text-charcoal-950 font-bold flex items-center justify-center shadow-lg shadow-brand-500/20 transition active:scale-95"
                  title={isPlaying ? 'Pause Stream' : 'Start Synchronized Playback'}
                >
                  {isPlaying ? (
                    <Pause className="w-6 h-6 fill-current" />
                  ) : (
                    <Play className="w-6 h-6 fill-current ml-0.5" />
                  )}
                </button>

                {/* Next Track */}
                <button
                  onClick={onNextTrack}
                  className="p-3 rounded-xl bg-charcoal-850 hover:bg-charcoal-800 border border-charcoal-750 text-slate-300 transition active:scale-95"
                  title="Next Track"
                >
                  <SkipForward className="w-4 h-4" />
                </button>

                {/* Stop */}
                <button
                  onClick={onStop}
                  className="p-3 rounded-xl bg-charcoal-850 hover:bg-charcoal-800 border border-charcoal-750 text-slate-300 transition active:scale-95"
                  title="Stop Playback"
                >
                  <Square className="w-4 h-4" />
                </button>
              </div>

              {/* Master Volume Slider */}
              <div className="flex items-center gap-3 bg-charcoal-850 border border-charcoal-750 px-3.5 py-2 rounded-xl w-full sm:w-auto">
                <button
                  onClick={onMuteToggle}
                  className="text-slate-400 hover:text-white transition"
                  title={isMuted ? 'Unmute Master' : 'Mute Master'}
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
                  className="w-full sm:w-28 h-1.5 bg-charcoal-750 rounded-lg appearance-none cursor-pointer accent-brand-500"
                />
                <span className="text-xs font-mono text-slate-400 w-9 text-right font-bold">
                  {Math.round((isMuted ? 0 : volume) * 100)}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Audio Library & Uploader (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-charcoal-900 border border-charcoal-750 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Music className="w-4 h-4 text-brand-400" />
                  <span>Audio Library</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Select or upload tracks to stream</p>
              </div>

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-charcoal-950 rounded-xl text-xs font-bold shadow transition disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{isUploading ? 'Uploading...' : 'Upload File'}</span>
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
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            {/* Tracks List */}
            <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
              {tracks.map((track) => {
                const isSelected = currentTrack?.id === track.id;
                const isTestTrack = track.id === 'test-metronome-sync';

                return (
                  <div
                    key={track.id}
                    onClick={() => onSelectTrack(track.id)}
                    className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition ${
                      isSelected
                        ? 'bg-brand-500/15 border-brand-500/50 text-white shadow-sm'
                        : 'bg-charcoal-850 border-charcoal-750 hover:bg-charcoal-800 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                          isSelected
                            ? 'bg-brand-500 text-charcoal-950 border-brand-400 font-bold'
                            : 'bg-charcoal-800 text-slate-400 border-charcoal-700'
                        }`}
                      >
                        {isTestTrack ? <Zap className="w-4 h-4 text-amber-300" /> : <Music className="w-4 h-4" />}
                      </div>
                      <div className="truncate">
                        <div className="font-semibold text-xs truncate flex items-center gap-1.5">
                          <span className="truncate">{track.title}</span>
                          {isTestTrack && (
                            <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded font-mono shrink-0 font-bold">
                              Built-in
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

      {/* Connected Receivers Quick Section */}
      <div className="bg-charcoal-900 border border-charcoal-750 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-brand-400" />
              <span>Connected Receivers ({receivers.length})</span>
            </h3>
            <p className="text-xs text-slate-400">
              Receivers locked into this stream over Wi-Fi / Hotspot
            </p>
          </div>

          <button
            onClick={onNavigateToDevices}
            className="text-xs text-brand-400 hover:underline font-semibold flex items-center gap-1"
          >
            <span>Full Device Manager</span>
            <span>&rarr;</span>
          </button>
        </div>

        {receivers.length === 0 ? (
          <div className="text-center py-8 px-4 rounded-xl border border-dashed border-charcoal-750 bg-charcoal-950/40">
            <Smartphone className="w-8 h-8 mx-auto text-slate-600 mb-2" />
            <p className="text-xs text-slate-400">
              No receivers connected yet. Tell your friends to scan the Room QR code!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {receivers.map((device) => {
              const quality = evaluateSyncQuality(device.clockOffsetMs, device.roundTripTimeMs);
              return (
                <div
                  key={device.id}
                  className="bg-charcoal-850 border border-charcoal-750 rounded-xl p-3 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="truncate">
                    <span className="font-bold text-white block truncate">{device.name}</span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      RTT: {formatTimeMs(device.roundTripTimeMs)} • Offset: {formatTimeMs(device.clockOffsetMs)}
                    </span>
                  </div>

                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-full uppercase font-bold shrink-0 ${
                      quality === 'excellent'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    }`}
                  >
                    {quality}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
