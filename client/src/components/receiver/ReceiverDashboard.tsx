import React from 'react';
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
  Radio,
  Clock,
  RotateCw,
  Zap,
  Music,
  AlertCircle,
  Sliders,
} from 'lucide-react';
import { AudioVisualizer } from '../common/AudioVisualizer';
import { SyncMetricsBadge } from '../common/SyncMetricsBadge';
import { AudioEngineState } from '../../core/audio/webAudioEngine';

interface Props {
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
  const effectiveDuration = durationSec > 0 ? durationSec : (currentTrack?.durationSec || 1);
  const progressPercent = Math.min(100, Math.max(0, (positionSec / effectiveDuration) * 100));

  const stateLabels: Record<AudioEngineState, { text: string; color: string }> = {
    unlocked: { text: 'Standby / Synchronized', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
    ready: { text: 'Stream Buffered & Ready', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
    playing: { text: 'Live Synchronized Playback', color: 'bg-brand-500/15 text-brand-400 border-brand-500/30' },
    buffering: { text: 'Buffering Audio Stream...', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
    paused: { text: 'Paused by Sender', color: 'bg-slate-800 text-slate-300 border-slate-700' },
    locked: { text: 'Tap to Activate Audio', color: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
    error: { text: 'Stream Loading Error', color: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
  };

  const currentState = stateLabels[engineState] || stateLabels.unlocked;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Top Receiver Status Card */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-brand-950 border border-brand-500/30 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center text-brand-400">
              <Radio className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <span className="text-[11px] font-semibold text-brand-400 uppercase tracking-wider block">
                Receiver Node
              </span>
              <h2 className="text-xl font-bold text-white">Synchronized Audio Stream</h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase border font-mono ${currentState.color}`}>
              {currentState.text}
            </span>
          </div>
        </div>

        {/* Audio Unlock Banner if suspended */}
        {!isAudioUnlocked && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-5 h-5 shrink-0 text-amber-400" />
              <span className="text-xs">
                Web Audio requires activation before audio can play through the speaker.
              </span>
            </div>
            <button
              onClick={() => onUnlockAudio()}
              className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow transition shrink-0"
            >
              Activate Now
            </button>
          </div>
        )}

        {/* Sync Metrics Header */}
        <SyncMetricsBadge metrics={syncMetrics} />
      </div>

      {/* Now Playing Display */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-brand-400 shrink-0">
              <Music className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-white truncate">
                {currentTrack?.title || 'Waiting for Sender Broadcast...'}
              </h3>
              <p className="text-xs text-slate-400">
                {currentTrack?.artist || 'EchoCast Sync Audio'} •{' '}
                <span className="font-mono uppercase">{currentTrack?.format || 'WAV'}</span>
              </p>
            </div>
          </div>

          <div className="text-right font-mono text-xs text-slate-400 shrink-0">
            {formatAudioTime(positionSec)} / {formatAudioTime(effectiveDuration)}
          </div>
        </div>

        {/* Visualizer Waveform */}
        <AudioVisualizer isActive={isPlaying} height={68} barCount={36} />

        {/* Progress Bar (Display only on Receiver) */}
        <div className="space-y-1">
          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-brand-600 to-indigo-500 h-full transition-all duration-100 ease-linear"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Local Volume Slider */}
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
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-brand-500"
            />
            <span className="text-xs font-mono text-slate-400 w-10 text-right">
              {Math.round((isMuted ? 0 : volume) * 100)}%
            </span>
          </div>

          <button
            onClick={onPlayLocalTestPulse}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg border border-slate-700 transition"
            title="Play local 1kHz test beep to verify audio output"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Test Sound</span>
          </button>
        </div>
      </div>

      {/* Latency Calibration & Output Routing Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Sliders className="w-4 h-4 text-brand-400" />
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
            className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 text-xs font-semibold transition ${
              outputType === 'speaker'
                ? 'bg-brand-500/20 border-brand-500 text-white shadow-lg'
                : 'bg-slate-800/40 border-slate-800 hover:bg-slate-800 text-slate-400'
            }`}
          >
            <Speaker className="w-5 h-5 text-brand-400" />
            <span>Built-in Speaker</span>
            <span className="text-[10px] font-mono opacity-60">0ms delay</span>
          </button>

          <button
            onClick={() => onOutputTypeChange('bluetooth')}
            className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 text-xs font-semibold transition ${
              outputType === 'bluetooth'
                ? 'bg-brand-500/20 border-brand-500 text-white shadow-lg'
                : 'bg-slate-800/40 border-slate-800 hover:bg-slate-800 text-slate-400'
            }`}
          >
            <Headphones className="w-5 h-5 text-cyan-400" />
            <span>Bluetooth Speaker</span>
            <span className="text-[10px] font-mono text-cyan-300">+160ms preset</span>
          </button>

          <button
            onClick={() => onOutputTypeChange('headphones')}
            className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 text-xs font-semibold transition col-span-2 sm:col-span-1 ${
              outputType === 'headphones'
                ? 'bg-brand-500/20 border-brand-500 text-white shadow-lg'
                : 'bg-slate-800/40 border-slate-800 hover:bg-slate-800 text-slate-400'
            }`}
          >
            <Headphones className="w-5 h-5 text-emerald-400" />
            <span>Wired Headphones</span>
            <span className="text-[10px] font-mono opacity-60">+10ms preset</span>
          </button>
        </div>

        {/* Fine Adjustment Slider */}
        <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-3">
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
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-brand-500"
            />
            <span className="text-[11px] font-mono text-slate-500">+350ms</span>
          </div>

          <div className="flex items-center justify-between pt-1">
            <p className="text-[11px] text-slate-400">
              Adjust if this speaker sounds ahead or behind other devices.
            </p>
            <button
              onClick={() => onManualOffsetChange(outputType === 'bluetooth' ? 160 : 0)}
              className="text-[11px] text-brand-400 hover:underline"
            >
              Reset to preset
            </button>
          </div>
        </div>

        {/* Precision Clock Diagnostics & Re-sync */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-brand-400" />
            <span>
              PTP Precision Clock • {syncMetrics.samplesCount} round-trip samples recorded
            </span>
          </div>

          <button
            onClick={onForceSync}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition self-start sm:self-auto"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>Re-calibrate Clock</span>
          </button>
        </div>
      </div>
    </div>
  );
};
