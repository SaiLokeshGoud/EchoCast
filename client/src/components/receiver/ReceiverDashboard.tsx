import React, { useState } from 'react';
import {
  AudioTrackMetadata,
  DeviceAudioOutput,
  SyncMetrics,
  formatAudioTime,
} from '@echocast/shared';
import {
  Headphones,
  Speaker,
  Volume2,
  VolumeX,
  Clock,
  RotateCw,
  Zap,
  AlertCircle,
  Sliders,
  QrCode,
  Disc,
  ArrowRight,
  Check,
} from 'lucide-react';
import { AudioVisualizer } from '../common/AudioVisualizer';
import { SyncMetricsBadge } from '../common/SyncMetricsBadge';
import { AudioEngineState } from '../../core/audio/webAudioEngine';

interface Props {
  currentRoomId: string;
  onConnectRoom: (roomId: string) => void;
  onOpenQrModal: () => void;
  currentTrack: AudioTrackMetadata | null;
  isPlaying: boolean;
  engineState: AudioEngineState;
  positionSec: number;
  durationSec: number;
  volume: number;
  isMuted: boolean;
  outputType: DeviceAudioOutput;
  manualOffsetMs: number;
  syncMetrics: SyncMetrics;
  isAudioUnlocked: boolean;
  onUnlockAudio: () => Promise<boolean>;
  onVolumeChange: (vol: number) => void;
  onMuteToggle: () => void;
  onOutputTypeChange: (type: DeviceAudioOutput) => void;
  onManualOffsetChange: (ms: number) => void;
  onForceSync: () => void;
  onPlayLocalTestPulse: () => void;
}

export const ReceiverDashboard: React.FC<Props> = ({
  currentRoomId,
  onConnectRoom,
  onOpenQrModal,
  currentTrack,
  isPlaying,
  engineState,
  positionSec,
  durationSec,
  volume,
  isMuted,
  outputType,
  manualOffsetMs,
  syncMetrics,
  isAudioUnlocked,
  onUnlockAudio,
  onVolumeChange,
  onMuteToggle,
  onOutputTypeChange,
  onManualOffsetChange,
  onForceSync,
  onPlayLocalTestPulse,
}) => {
  const [roomCodeInput, setRoomCodeInput] = useState(currentRoomId);
  const [justConnected, setJustConnected] = useState(false);

  const effectiveDuration = durationSec > 0 ? durationSec : (currentTrack?.durationSec || 1);
  const progressPercent = Math.min(100, Math.max(0, (positionSec / effectiveDuration) * 100));

  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomCodeInput.trim()) {
      onConnectRoom(roomCodeInput.trim().toUpperCase());
      setJustConnected(true);
      setTimeout(() => setJustConnected(false), 2000);
    }
  };

  const stateLabels: Record<AudioEngineState, { text: string; color: string }> = {
    unlocked: { text: 'Standby / Synchronized', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
    ready: { text: 'Stream Buffered & Ready', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
    playing: { text: 'Live Synchronized Playback', color: 'bg-brand-500/15 text-brand-400 border-brand-500/30' },
    buffering: { text: 'Buffering Audio Stream...', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
    paused: { text: 'Stream Paused by Sender', color: 'bg-slate-800 text-slate-300 border-slate-700' },
    locked: { text: 'Tap to Activate Audio', color: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
    error: { text: 'Stream Loading Error', color: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
  };

  const currentState = stateLabels[engineState] || stateLabels.unlocked;

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-8">
      {/* Room Connection Bar */}
      <div className="bg-charcoal-900 border border-charcoal-750 rounded-2xl p-5 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <form onSubmit={handleConnect} className="flex items-center gap-2 flex-1 max-w-md">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider shrink-0">
            Room Code:
          </label>
          <input
            type="text"
            value={roomCodeInput}
            onChange={(e) => setRoomCodeInput(e.target.value)}
            maxLength={16}
            placeholder="e.g. CAST-842"
            className="w-full px-3 py-2 rounded-xl bg-charcoal-850 border border-charcoal-700 text-white font-mono text-xs font-bold uppercase focus:outline-none focus:border-brand-500"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-charcoal-950 font-bold text-xs flex items-center gap-1.5 shadow transition shrink-0 active:scale-95"
          >
            {justConnected ? <Check className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
            <span>{justConnected ? 'Connected' : 'Connect'}</span>
          </button>
        </form>

        <div className="flex items-center gap-3 self-end sm:self-auto">
          <button
            onClick={onOpenQrModal}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-charcoal-850 hover:bg-charcoal-800 border border-charcoal-750 text-xs font-medium text-slate-300 transition"
          >
            <QrCode className="w-3.5 h-3.5 text-cyanAccent-400" />
            <span>Pairing Codes</span>
          </button>

          <span className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold uppercase border ${currentState.color}`}>
            {currentState.text}
          </span>
        </div>
      </div>

      {/* Audio Unlock Overlay Banner on mobile if suspended */}
      {!isAudioUnlocked && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 shrink-0 text-amber-400" />
            <span className="text-xs font-medium">
              Web Audio requires activation before sound can play through this device's speaker.
            </span>
          </div>
          <button
            onClick={() => onUnlockAudio()}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-charcoal-950 font-bold text-xs rounded-xl shadow transition shrink-0 active:scale-95"
          >
            Activate Speaker
          </button>
        </div>
      )}

      {/* Sync Quality Metric Card */}
      <SyncMetricsBadge metrics={syncMetrics} />

      {/* Synchronized Playback Display & Album Artwork */}
      <div className="bg-charcoal-900 border border-charcoal-750 rounded-2xl p-6 shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
          {/* Vinyl Disc Artwork */}
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
              </div>
            </div>
            {isPlaying && (
              <span className="absolute bottom-1 right-1 w-3.5 h-3.5 rounded-full bg-brand-500 ring-2 ring-charcoal-900 animate-pulse" />
            )}
          </div>

          {/* Track Details */}
          <div className="flex-1 text-center sm:text-left min-w-0 space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-charcoal-850 border border-charcoal-700 text-[10px] font-mono font-bold text-brand-400 uppercase">
              {isPlaying ? 'Synchronized In Phase' : 'Awaiting Broadcast'}
            </div>
            <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight truncate">
              {currentTrack?.title || 'Waiting for Sender Broadcast...'}
            </h3>
            <p className="text-xs text-slate-400 font-medium truncate">
              {currentTrack?.artist || 'EchoCast Sync Audio Engine'}
            </p>
            <div className="flex items-center justify-center sm:justify-start gap-2 pt-1 text-[11px] font-mono text-slate-400">
              <span className="px-2 py-0.5 bg-charcoal-850 rounded border border-charcoal-750 uppercase">
                {currentTrack?.format || 'WAV'}
              </span>
              <span>•</span>
              <span>
                {formatAudioTime(positionSec)} / {formatAudioTime(effectiveDuration)}
              </span>
            </div>
          </div>
        </div>

        {/* Visualizer Waveform */}
        <AudioVisualizer isActive={isPlaying} height={56} barCount={36} />

        {/* Synchronized Progress Bar */}
        <div className="space-y-1">
          <div className="w-full bg-charcoal-800 h-2 rounded-full overflow-hidden">
            <div
              className="bg-brand-500 h-full transition-all duration-100 ease-linear"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Local Volume Controls */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-3 flex-1 max-w-sm">
            <button
              onClick={onMuteToggle}
              className="text-slate-400 hover:text-white transition"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-5 h-5 text-rose-400" />
              ) : (
                <Volume2 className="w-5 h-5 text-brand-400" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={isMuted ? 0 : volume}
              onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-charcoal-800 rounded-lg appearance-none cursor-pointer accent-brand-500"
            />
            <span className="text-xs font-mono text-slate-400 w-10 text-right font-bold">
              {Math.round((isMuted ? 0 : volume) * 100)}%
            </span>
          </div>

          <button
            onClick={onPlayLocalTestPulse}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-charcoal-850 hover:bg-charcoal-800 border border-charcoal-700 text-xs text-slate-300 font-medium rounded-xl transition"
            title="Play local click tone"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Test Sound</span>
          </button>
        </div>
      </div>

      {/* Latency Calibration & Output Routing Card */}
      <div className="bg-charcoal-900 border border-charcoal-750 rounded-2xl p-6 shadow-xl space-y-5">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Sliders className="w-4 h-4 text-cyanAccent-400" />
            <span>Audio Output & Latency Calibration</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Compensate for Bluetooth speaker latency or fine-tune audio alignment down to the millisecond.
          </p>
        </div>

        {/* Output Device Type Selector */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <button
            onClick={() => onOutputTypeChange('speaker')}
            className={`p-3.5 rounded-xl border flex flex-col items-center justify-center gap-1.5 text-xs font-semibold transition ${
              outputType === 'speaker'
                ? 'bg-brand-500/15 border-brand-500 text-white shadow-sm'
                : 'bg-charcoal-850 border-charcoal-750 hover:bg-charcoal-800 text-slate-400'
            }`}
          >
            <Speaker className="w-5 h-5 text-brand-400" />
            <span>Built-in Speaker</span>
            <span className="text-[10px] font-mono text-slate-500">0ms delay preset</span>
          </button>

          <button
            onClick={() => onOutputTypeChange('bluetooth')}
            className={`p-3.5 rounded-xl border flex flex-col items-center justify-center gap-1.5 text-xs font-semibold transition ${
              outputType === 'bluetooth'
                ? 'bg-brand-500/15 border-brand-500 text-white shadow-sm'
                : 'bg-charcoal-850 border-charcoal-750 hover:bg-charcoal-800 text-slate-400'
            }`}
          >
            <Headphones className="w-5 h-5 text-cyanAccent-400" />
            <span>Bluetooth Speaker</span>
            <span className="text-[10px] font-mono text-cyanAccent-400">+160ms preset</span>
          </button>

          <button
            onClick={() => onOutputTypeChange('headphones')}
            className={`p-3.5 rounded-xl border flex flex-col items-center justify-center gap-1.5 text-xs font-semibold transition col-span-2 sm:col-span-1 ${
              outputType === 'headphones'
                ? 'bg-brand-500/15 border-brand-500 text-white shadow-sm'
                : 'bg-charcoal-850 border-charcoal-750 hover:bg-charcoal-800 text-slate-400'
            }`}
          >
            <Headphones className="w-5 h-5 text-slate-300" />
            <span>Wired Headphones</span>
            <span className="text-[10px] font-mono text-slate-500">+10ms preset</span>
          </button>
        </div>

        {/* Fine Adjustment Slider */}
        <div className="bg-charcoal-850 p-4 rounded-xl border border-charcoal-750 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-300">Manual Latency Adjustment:</span>
            <span className="font-mono font-bold text-brand-400">
              {manualOffsetMs > 0 ? `+${manualOffsetMs}` : manualOffsetMs} ms
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[11px] font-mono text-slate-500">-250ms</span>
            <input
              type="range"
              min={-250}
              max={350}
              step={5}
              value={manualOffsetMs}
              onChange={(e) => onManualOffsetChange(parseInt(e.target.value, 10))}
              className="w-full h-1.5 bg-charcoal-750 rounded-lg appearance-none cursor-pointer accent-brand-500"
            />
            <span className="text-[11px] font-mono text-slate-500">+350ms</span>
          </div>

          <div className="flex items-center justify-between pt-1">
            <p className="text-[11px] text-slate-400">
              Adjust if this device sounds ahead or behind other speakers.
            </p>
            <button
              onClick={() => onManualOffsetChange(outputType === 'bluetooth' ? 160 : 0)}
              className="text-[11px] text-brand-400 hover:underline font-medium"
            >
              Reset to preset
            </button>
          </div>
        </div>

        {/* Diagnostics & Re-sync */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" />
            <span className="font-mono text-[11px]">
              PTP Monotonic Clock • {syncMetrics.samplesCount} sync bursts recorded
            </span>
          </div>

          <button
            onClick={onForceSync}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-charcoal-850 hover:bg-charcoal-800 border border-charcoal-750 text-slate-300 font-medium transition self-start sm:self-auto"
          >
            <RotateCw className="w-3.5 h-3.5 text-brand-400" />
            <span>Re-calibrate Clock</span>
          </button>
        </div>
      </div>
    </div>
  );
};
