import React, { useState, useRef } from 'react';
import {
  AudioTrackMetadata,
  DeviceInfo,
  formatAudioTime,
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
  ChevronUp,
  ChevronDown,
  Trash2,
  Repeat,
  Sparkles,
  AlertTriangle,
  Power,
  RefreshCw,
  FolderPlus,
} from 'lucide-react';
import { AudioVisualizer } from '../common/AudioVisualizer';
import { wsClient } from '../../core/network/wsClient';

interface Props {
  roomId: string;
  onUpdateRoomId: (newRoomId: string) => void;
  isRoomActive: boolean;
  onToggleRoomActive: (active: boolean) => void;
  onOpenQrModal: () => void;
  currentTrack: AudioTrackMetadata | null;
  tracks: AudioTrackMetadata[];
  playlist: AudioTrackMetadata[];
  isPlaying: boolean;
  autoplay: boolean;
  onToggleAutoplay: (enabled: boolean) => void;
  loop: boolean;
  onToggleLoop: (enabled: boolean) => void;
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
  onDeleteTrack: (trackId: string) => void;
  onReorderPlaylist: (newOrder: AudioTrackMetadata[]) => void;
  onNavigateToDevices: () => void;
  primaryUrl: string;
  isHotspotDetected: boolean;
}

export const SenderDashboard: React.FC<Props> = ({
  roomId,
  onUpdateRoomId,
  isRoomActive,
  onToggleRoomActive,
  onOpenQrModal,
  currentTrack,
  tracks,
  playlist,
  isPlaying,
  autoplay,
  onToggleAutoplay,
  loop,
  onToggleLoop,
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
  onDeleteTrack,
  onReorderPlaylist,
  onNavigateToDevices,
  primaryUrl,
  isHotspotDetected,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isEditingRoom, setIsEditingRoom] = useState(false);
  const [customRoomInput, setCustomRoomInput] = useState(roomId);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const effectiveDuration = durationSec > 0 ? durationSec : (currentTrack?.durationSec || 1);
  const displayPlaylist = playlist.length > 0 ? playlist : tracks;

  const joinLink = `${primaryUrl}/?room=${encodeURIComponent(roomId)}&role=receiver`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(joinLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleGenerateRoomId = () => {
    const randomCode = `CAST-${Math.floor(1000 + Math.random() * 9000)}`;
    onUpdateRoomId(randomCode);
  };

  const handleSaveRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (customRoomInput.trim()) {
      onUpdateRoomId(customRoomInput.trim().toUpperCase());
      setIsEditingRoom(false);
    }
  };

  // Supported audio extensions & validation
  const validateAndUploadFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setUploadError(null);
    const validExtensions = ['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a', 'weba', 'webm', 'opus'];
    const invalidFiles: string[] = [];
    const oversizedFiles: string[] = [];
    const validFiles: File[] = [];

    for (const f of fileArray) {
      const ext = f.name.split('.').pop()?.toLowerCase() || '';
      if (!validExtensions.includes(ext) && !f.type.startsWith('audio/')) {
        invalidFiles.push(f.name);
      } else if (f.size > 100 * 1024 * 1024) {
        oversizedFiles.push(f.name);
      } else if (f.size === 0) {
        invalidFiles.push(`${f.name} (empty 0 bytes)`);
      } else {
        validFiles.push(f);
      }
    }

    if (invalidFiles.length > 0) {
      setUploadError(`Unsupported format: ${invalidFiles.join(', ')}. Supported formats: MP3, WAV, AAC, FLAC, OGG, M4A.`);
      return;
    }

    if (oversizedFiles.length > 0) {
      setUploadError(`File too large: ${oversizedFiles.join(', ')}. Maximum file size is 100MB.`);
      return;
    }

    if (validFiles.length === 0) return;

    setIsUploading(true);
    const formData = new FormData();
    validFiles.forEach((file) => {
      formData.append('audio', file);
    });

    try {
      const res = await fetch('/api/audio/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Upload failed');
      }

      onRefreshTracks();
    } catch (err: any) {
      setUploadError(err.message || 'Failed to upload audio files');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      validateAndUploadFiles(e.dataTransfer.files);
    }
  };

  const handleMoveTrack = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= displayPlaylist.length) return;

    const newPlaylist = [...displayPlaylist];
    const [moved] = newPlaylist.splice(index, 1);
    newPlaylist.splice(targetIndex, 0, moved);
    onReorderPlaylist(newPlaylist);
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

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {/* Top Banner: Room Management & Network State */}
      <div className="bg-charcoal-900 border border-charcoal-750 rounded-2xl p-5 shadow-lg space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Room Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Room Active / End Room Toggle */}
            <button
              onClick={() => onToggleRoomActive(!isRoomActive)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-sm ${
                isRoomActive
                  ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 hover:bg-rose-500/10 hover:border-rose-500/30 hover:text-rose-400'
                  : 'bg-charcoal-800 border border-charcoal-700 text-slate-400 hover:bg-emerald-500/20 hover:text-emerald-400'
              }`}
              title={isRoomActive ? 'Click to End Room' : 'Click to Open Room'}
            >
              <Power className="w-3.5 h-3.5" />
              <span>{isRoomActive ? 'Room Active' : 'Room Closed'}</span>
            </button>

            {/* Room ID Display & Editing */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Room:</span>
              {isEditingRoom ? (
                <form onSubmit={handleSaveRoom} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={customRoomInput}
                    onChange={(e) => setCustomRoomInput(e.target.value)}
                    maxLength={16}
                    className="px-2.5 py-1 bg-charcoal-850 border border-charcoal-700 rounded-lg text-xs font-mono font-bold text-brand-400 uppercase focus:outline-none focus:border-brand-500 w-28"
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1 bg-brand-500 text-charcoal-950 rounded-lg text-xs font-bold"
                  >
                    Save
                  </button>
                </form>
              ) : (
                <div className="flex items-center gap-1.5 bg-charcoal-850 border border-charcoal-750 px-3 py-1.5 rounded-xl font-mono text-sm font-bold text-brand-400">
                  <span>{roomId}</span>
                </div>
              )}
            </div>

            {!isEditingRoom && (
              <div className="flex items-center gap-1.5 text-xs">
                <button
                  onClick={() => {
                    setCustomRoomInput(roomId);
                    setIsEditingRoom(true);
                  }}
                  className="text-slate-400 hover:text-white transition font-medium"
                >
                  Edit
                </button>
                <span className="text-slate-600">•</span>
                <button
                  onClick={handleGenerateRoomId}
                  className="text-slate-400 hover:text-brand-400 transition font-medium flex items-center gap-1"
                  title="Generate new random Room ID"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>New ID</span>
                </button>
              </div>
            )}

            <div className="h-4 w-px bg-charcoal-750 hidden sm:block" />

            {/* Copy Joining Address */}
            <button
              onClick={handleCopyLink}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-charcoal-850 hover:bg-charcoal-800 border border-charcoal-750 text-xs font-medium text-slate-200 transition"
              title="Copy receiver joining URL"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 opacity-70" />}
              <span>{copiedLink ? 'Link Copied!' : 'Copy Join Link'}</span>
            </button>

            {/* QR Code Button */}
            <button
              onClick={onOpenQrModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-charcoal-850 hover:bg-charcoal-800 border border-charcoal-750 text-xs font-medium text-cyanAccent-400 transition"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Room QR</span>
            </button>
          </div>

          {/* Network & Connected Receiver Count */}
          <div className="flex items-center gap-3 self-start lg:self-auto">
            <div
              onClick={onNavigateToDevices}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-charcoal-850 border border-charcoal-750 text-xs font-mono cursor-pointer hover:bg-charcoal-800 transition"
              title="Click to view and manage receiver devices"
            >
              <Users className="w-3.5 h-3.5 text-brand-400" />
              <span className="text-slate-400">Receivers:</span>
              <span className="text-white font-bold">{receivers.length}</span>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-charcoal-850 border border-charcoal-750 text-xs font-mono text-slate-400">
              <Wifi className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden sm:inline">{primaryUrl.replace(/^https?:\/\//, '')}</span>
              <span className="text-emerald-400 font-bold ml-1">
                {isHotspotDetected ? 'Hotspot' : 'Wi-Fi'}
              </span>
            </div>

            <button
              onClick={handleTestPulse}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-charcoal-800 hover:bg-charcoal-750 border border-charcoal-700 text-xs text-amber-300 font-medium transition"
              title="Broadcast 1kHz alignment click across all connected speakers"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Sync Pulse</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Player Console on left (7 cols), Playlist & Selection on right (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Player Console & Album Artwork (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-charcoal-900 border border-charcoal-750 rounded-2xl p-6 shadow-xl space-y-6">
            {/* Album Artwork & Metadata Header */}
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
              {/* Spinning Vinyl Album Artwork */}
              <div className="relative group shrink-0">
                <div
                  className={`w-32 h-32 sm:w-36 sm:h-36 rounded-2xl bg-charcoal-850 border border-charcoal-700 flex items-center justify-center shadow-lg overflow-hidden transition-all duration-300 ${
                    isPlaying ? 'ring-2 ring-brand-500/40' : ''
                  }`}
                >
                  <div className="w-full h-full bg-gradient-to-br from-charcoal-800 to-navy-950 flex flex-col items-center justify-center p-3 text-center relative">
                    <Disc
                      className={`w-16 h-16 text-slate-600 transition-transform duration-700 ${
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
                  {isPlaying ? 'Streaming Live' : 'Ready to Broadcast'}
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight truncate">
                  {currentTrack?.title || 'No Audio Loaded'}
                </h3>
                <p className="text-xs text-slate-400 font-medium truncate">
                  {currentTrack?.artist || 'EchoCast Synchronized Engine'}
                </p>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1 text-[11px] font-mono text-slate-400">
                  <span className="px-2 py-0.5 bg-charcoal-850 rounded border border-charcoal-750 uppercase font-bold text-slate-300">
                    {currentTrack?.format || 'WAV'}
                  </span>
                  <span>•</span>
                  <span>{formatAudioTime(effectiveDuration)}</span>
                  <span>•</span>
                  <span>{formatFileSize(currentTrack?.sizeBytes)}</span>
                </div>
              </div>
            </div>

            {/* Stereo Audio Visualizer */}
            <AudioVisualizer isActive={isPlaying} height={52} barCount={36} />

            {/* Scrub Bar */}
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
              <div className="flex items-center gap-2.5 sm:gap-3">
                {/* Previous Track */}
                <button
                  onClick={onPreviousTrack}
                  className="p-3 rounded-xl bg-charcoal-850 hover:bg-charcoal-800 border border-charcoal-750 text-slate-300 transition active:scale-95"
                  title="Previous Track (or Restart)"
                >
                  <SkipBack className="w-4 h-4" />
                </button>

                {/* Restart Track */}
                <button
                  onClick={() => onSeek(0)}
                  className="p-3 rounded-xl bg-charcoal-850 hover:bg-charcoal-800 border border-charcoal-750 text-slate-300 transition active:scale-95"
                  title="Restart Track (00:00)"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>

                {/* Center Play / Pause */}
                <button
                  onClick={() => (isPlaying ? onPause() : onPlay())}
                  className="w-14 h-14 rounded-2xl bg-brand-500 hover:bg-brand-600 text-charcoal-950 font-bold flex items-center justify-center shadow-lg shadow-brand-500/20 transition active:scale-95"
                  title={isPlaying ? 'Pause Broadcast' : 'Play / Resume Stream'}
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

              {/* Autoplay & Loop Toggles */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onToggleAutoplay(!autoplay)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition flex items-center gap-1.5 ${
                    autoplay
                      ? 'bg-brand-500/15 border-brand-500/40 text-brand-400'
                      : 'bg-charcoal-850 border-charcoal-750 text-slate-400 hover:bg-charcoal-800'
                  }`}
                  title="Automatically play the next playlist track"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Autoplay {autoplay ? 'ON' : 'OFF'}</span>
                </button>

                <button
                  onClick={() => onToggleLoop(!loop)}
                  className={`p-2 rounded-xl border text-xs transition ${
                    loop
                      ? 'bg-brand-500/15 border-brand-500/40 text-brand-400'
                      : 'bg-charcoal-850 border-charcoal-750 text-slate-400 hover:bg-charcoal-800'
                  }`}
                  title="Loop Current Track"
                >
                  <Repeat className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Master Volume Bar */}
            <div className="flex items-center justify-between pt-2 border-t border-charcoal-750/70">
              <span className="text-xs font-bold text-slate-400">Master Broadcast Volume</span>
              <div className="flex items-center gap-3 bg-charcoal-850 border border-charcoal-750 px-3.5 py-1.5 rounded-xl">
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
                  className="w-24 sm:w-32 h-1.5 bg-charcoal-750 rounded-lg appearance-none cursor-pointer accent-brand-500"
                />
                <span className="text-xs font-mono text-slate-400 w-8 text-right font-bold">
                  {Math.round((isMuted ? 0 : volume) * 100)}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Playlist & Audio File Selection (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-charcoal-900 border border-charcoal-750 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Music className="w-4 h-4 text-brand-400" />
                  <span>Playlist ({displayPlaylist.length})</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Drag, reorder, or batch upload tracks</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-charcoal-950 rounded-xl text-xs font-bold shadow transition disabled:opacity-50"
                  title="Upload MP3, WAV, AAC, FLAC, OGG"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{isUploading ? 'Uploading...' : 'Add Files'}</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="audio/*,.mp3,.wav,.ogg,.aac,.flac,.m4a,.opus,.weba"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) validateAndUploadFiles(e.target.files);
                  }}
                />
              </div>
            </div>

            {/* Drag & Drop File Zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`p-4 rounded-xl border border-dashed text-center cursor-pointer transition ${
                isDragging
                  ? 'bg-brand-500/10 border-brand-500 text-brand-300'
                  : 'bg-charcoal-850/50 border-charcoal-750 hover:bg-charcoal-850 hover:border-charcoal-700 text-slate-400'
              }`}
            >
              <FolderPlus className="w-5 h-5 mx-auto mb-1 text-slate-400" />
              <p className="text-xs font-medium">
                Drop audio files here or <span className="text-brand-400 underline">browse</span>
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">Supports MP3, WAV, AAC, FLAC, OGG, M4A up to 100MB</p>
            </div>

            {uploadError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            {/* Playlist Queue */}
            <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
              {displayPlaylist.map((track, idx) => {
                const isSelected = currentTrack?.id === track.id;
                const isTestTrack = track.id === 'test-metronome-sync';

                return (
                  <div
                    key={track.id}
                    onClick={() => onSelectTrack(track.id)}
                    className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition group ${
                      isSelected
                        ? 'bg-brand-500/15 border-brand-500/50 text-white shadow-sm'
                        : 'bg-charcoal-850 border-charcoal-750 hover:bg-charcoal-800 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {/* Index / Track Icon */}
                      <span className="font-mono text-xs text-slate-500 font-bold w-4 text-center shrink-0">
                        {idx + 1}
                      </span>

                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                          isSelected
                            ? 'bg-brand-500 text-charcoal-950 border-brand-400 font-bold'
                            : 'bg-charcoal-800 text-slate-400 border-charcoal-700'
                        }`}
                      >
                        {isTestTrack ? <Zap className="w-4 h-4 text-amber-300" /> : <Music className="w-4 h-4" />}
                      </div>

                      {/* Track Details */}
                      <div className="truncate min-w-0 flex-1">
                        <div className="font-semibold text-xs truncate flex items-center gap-1.5">
                          <span className="truncate">{track.title}</span>
                          {isTestTrack && (
                            <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded font-mono font-bold shrink-0">
                              Demo
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] opacity-70 font-mono flex items-center gap-2">
                          <span>{formatAudioTime(track.durationSec)}</span>
                          <span>•</span>
                          <span className="uppercase">{track.format}</span>
                          {track.sizeBytes && (
                            <>
                              <span>•</span>
                              <span>{formatFileSize(track.sizeBytes)}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Reorder and Delete Actions */}
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      {/* Move Up */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMoveTrack(idx, 'up');
                        }}
                        disabled={idx === 0}
                        className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-20 hover:bg-charcoal-700 transition"
                        title="Move Up"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>

                      {/* Move Down */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMoveTrack(idx, 'down');
                        }}
                        disabled={idx === displayPlaylist.length - 1}
                        className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-20 hover:bg-charcoal-700 transition"
                        title="Move Down"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>

                      {/* Delete Track */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteTrack(track.id);
                        }}
                        className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                        title="Remove track"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
