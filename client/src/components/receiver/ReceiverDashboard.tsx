import React, { useState, useEffect, useRef } from 'react';
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
  Camera,
  X,
  Wifi,
  Radio,
  LogOut,
  Layers,
  ShieldAlert,
} from 'lucide-react';
import { AudioVisualizer } from '../common/AudioVisualizer';
import { SyncMetricsBadge } from '../common/SyncMetricsBadge';
import { AudioEngineState } from '../../core/audio/webAudioEngine';

interface Props {
  currentRoomId: string;
  isRoomActive?: boolean;
  connectionStatus: 'connected' | 'connecting' | 'disconnected' | 'reconnecting';
  roomValidationError?: string | null;
  senderInfo?: {
    primaryUrl: string;
    senderConnected: boolean;
    connectedReceiversCount: number;
  };
  onConnectRoom: (roomId: string) => Promise<boolean> | void;
  onDisconnectRoom: () => void;
  onOpenQrModal: () => void;
  currentTrack: AudioTrackMetadata | null;
  isPlaying: boolean;
  engineState: AudioEngineState;
  bufferProgress: number;
  cacheCount: number;
  positionSec: number;
  durationSec: number;
  volume: number;
  isMuted: boolean;
  outputType: DeviceAudioOutput;
  manualOffsetMs: number;
  syncMetrics: SyncMetrics;
  syncErrorMs?: number;
  driftCorrectionInfo?: { active: boolean; rate: number };
  lastErrorMessage?: string | null;
  onClearError?: () => void;
  isAudioUnlocked: boolean;
  onUnlockAudio: () => Promise<boolean>;
  onVolumeChange: (vol: number) => void;
  onMuteToggle: () => void;
  onOutputTypeChange: (type: DeviceAudioOutput) => void;
  onManualOffsetChange: (ms: number) => void;
  onForceSync: () => void;
  onPlayLocalTestPulse: () => void;
  onSetAudioSinkId?: (sinkId: string) => Promise<boolean>;
}

export const ReceiverDashboard: React.FC<Props> = ({
  currentRoomId,
  isRoomActive = true,
  connectionStatus,
  roomValidationError,
  senderInfo,
  onConnectRoom,
  onDisconnectRoom,
  onOpenQrModal,
  currentTrack,
  isPlaying,
  engineState,
  bufferProgress,
  cacheCount,
  positionSec,
  durationSec,
  volume,
  isMuted,
  outputType,
  manualOffsetMs,
  syncMetrics,
  syncErrorMs,
  driftCorrectionInfo,
  lastErrorMessage,
  onClearError,
  isAudioUnlocked,
  onUnlockAudio,
  onVolumeChange,
  onMuteToggle,
  onOutputTypeChange,
  onManualOffsetChange,
  onForceSync,
  onPlayLocalTestPulse,
  onSetAudioSinkId,
}) => {
  const [roomCodeInput, setRoomCodeInput] = useState(currentRoomId);
  const [isVerifying, setIsVerifying] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [justConnected, setJustConnected] = useState(false);

  // In-browser Camera QR Scanner
  const [isScanningQr, setIsScanningQr] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scanIntervalRef = useRef<any>(null);

  // Available audio output devices
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('default');

  useEffect(() => {
    setRoomCodeInput(currentRoomId);
  }, [currentRoomId]);

  // Enumerate hardware output devices if supported
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then((devices) => {
        const audioOutputs = devices.filter((d) => d.kind === 'audiooutput');
        setAudioDevices(audioOutputs);
      }).catch(() => {});
    }
  }, []);

  // Handle camera QR scanning
  const startCameraScanner = async () => {
    setCameraError(null);
    setIsScanningQr(true);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access not supported on this browser.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // If BarcodeDetector API is natively supported (Chrome Android / modern desktop)
      if ('BarcodeDetector' in window) {
        const barcodeDetector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
        scanIntervalRef.current = setInterval(async () => {
          if (videoRef.current && videoRef.current.readyState >= 2) {
            try {
              const barcodes = await barcodeDetector.detect(videoRef.current);
              if (barcodes.length > 0) {
                const rawValue = barcodes[0].rawValue;
                handleScannedUrl(rawValue);
                stopCameraScanner();
              }
            } catch {}
          }
        }, 300);
      }
    } catch (err: any) {
      console.warn('Camera scan failed', err);
      setCameraError(err.message || 'Unable to access camera.');
    }
  };

  const stopCameraScanner = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsScanningQr(false);
  };

  const handleScannedUrl = (scannedText: string) => {
    try {
      // Check if it's a full URL containing ?room= or ?join=
      const url = new URL(scannedText);
      const room = url.searchParams.get('room') || url.searchParams.get('join') || url.searchParams.get('code');
      if (room) {
        setRoomCodeInput(room.toUpperCase());
        executeConnect(room.toUpperCase());
        return;
      }
    } catch {
      // Not a valid URL, treat as raw room ID if matches pattern
    }

    const trimmed = scannedText.trim().toUpperCase();
    setRoomCodeInput(trimmed);
    executeConnect(trimmed);
  };

  const executeConnect = async (targetRoomId: string) => {
    setLocalError(null);
    setIsVerifying(true);

    try {
      // Pre-flight validation against server
      const res = await fetch(`/api/room/verify?roomId=${encodeURIComponent(targetRoomId)}`);
      const data = await res.json();

      if (!res.ok || !data.valid) {
        setLocalError(data.error || `Room "${targetRoomId}" is invalid or closed.`);
        setIsVerifying(false);
        return;
      }

      onConnectRoom(targetRoomId);
      setJustConnected(true);
      setTimeout(() => setJustConnected(false), 2500);
    } catch {
      // If REST fetch failed (e.g. offline or custom port), pass directly to WebSocket connect
      onConnectRoom(targetRoomId);
      setJustConnected(true);
      setTimeout(() => setJustConnected(false), 2500);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSubmitConnect = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomCodeInput.trim()) {
      executeConnect(roomCodeInput.trim().toUpperCase());
    }
  };

  const handleSelectOutputDevice = async (sinkId: string) => {
    setSelectedDeviceId(sinkId);
    if (onSetAudioSinkId) {
      await onSetAudioSinkId(sinkId);
    }
  };

  const effectiveDuration = durationSec > 0 ? durationSec : (currentTrack?.durationSec || 1);
  const progressPercent = Math.min(100, Math.max(0, (positionSec / effectiveDuration) * 100));

  const stateLabels: Record<AudioEngineState, { text: string; color: string }> = {
    unlocked: { text: 'Standby / Synchronized', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
    ready: { text: 'Stream Buffered & Ready', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
    playing: { text: 'Live Synchronized Playback', color: 'bg-brand-500/15 text-brand-400 border-brand-500/30' },
    buffering: { text: `Buffering Audio (${bufferProgress}%)`, color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
    paused: { text: 'Stream Paused by Sender', color: 'bg-slate-800 text-slate-300 border-slate-700' },
    locked: { text: 'Tap to Activate Speaker', color: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
    error: { text: 'Stream Loading Error', color: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
  };

  const currentState = stateLabels[engineState] || stateLabels.unlocked;
  const isConnected = connectionStatus === 'connected';

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-8">
      {/* Room Inactive / Closed Notice */}
      {!isRoomActive && (
        <div className="p-4 rounded-2xl bg-charcoal-900 border border-amber-500/30 text-amber-300 flex items-center gap-3 text-xs shadow-md">
          <AlertCircle className="w-5 h-5 shrink-0 text-amber-400" />
          <div>
            <span className="font-bold">Room Stream Inactive: </span>
            The sender has paused or closed room <span className="font-mono font-bold">{currentRoomId}</span>. Audio playback is standing by.
          </div>
        </div>
      )}

      {/* Room Authorization or Validation Error */}
      {(roomValidationError || localError) && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center justify-between gap-3 text-xs shadow-md">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-5 h-5 shrink-0 text-rose-400" />
            <span>{roomValidationError || localError}</span>
          </div>
          <button
            onClick={() => {
              setLocalError(null);
            }}
            className="text-xs font-bold text-rose-400 hover:underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Connection & Room Pairing Bar */}
      <div className="bg-charcoal-900 border border-charcoal-750 rounded-2xl p-5 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Room Code Form */}
          <form onSubmit={handleSubmitConnect} className="flex items-center gap-2 flex-1 max-w-md">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider shrink-0 flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-brand-400" />
              <span>Room Code:</span>
            </label>
            <input
              type="text"
              value={roomCodeInput}
              onChange={(e) => setRoomCodeInput(e.target.value)}
              maxLength={16}
              placeholder="e.g. CAST-842"
              disabled={isVerifying}
              className="w-full px-3 py-2 rounded-xl bg-charcoal-850 border border-charcoal-700 text-white font-mono text-xs font-bold uppercase focus:outline-none focus:border-brand-500 transition"
            />
            <button
              type="submit"
              disabled={isVerifying || !roomCodeInput.trim()}
              className="px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-charcoal-950 font-bold text-xs flex items-center gap-1.5 shadow transition shrink-0 active:scale-95"
            >
              {justConnected ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Joined</span>
                </>
              ) : isVerifying ? (
                <>
                  <RotateCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>{isConnected ? 'Switch Room' : 'Connect'}</span>
                </>
              )}
            </button>
          </form>

          {/* QR Pairing Actions */}
          <div className="flex items-center gap-2.5 self-end sm:self-auto flex-wrap">
            <button
              onClick={startCameraScanner}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-charcoal-850 hover:bg-charcoal-800 border border-charcoal-750 text-xs font-medium text-slate-300 transition active:scale-95"
              title="Scan QR Code with Camera"
            >
              <Camera className="w-3.5 h-3.5 text-brand-400" />
              <span>Scan QR</span>
            </button>

            <button
              onClick={onOpenQrModal}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-charcoal-850 hover:bg-charcoal-800 border border-charcoal-750 text-xs font-medium text-slate-300 transition"
              title="Show pairing QR codes"
            >
              <QrCode className="w-3.5 h-3.5 text-cyanAccent-400" />
              <span>Pairing Codes</span>
            </button>

            {isConnected && (
              <button
                onClick={onDisconnectRoom}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-xs font-semibold text-rose-300 transition active:scale-95"
                title="Disconnect from this room"
              >
                <LogOut className="w-3.5 h-3.5 text-rose-400" />
                <span>Leave</span>
              </button>
            )}
          </div>
        </div>

        {/* Sender & Room Meta Info Row */}
        <div className="pt-3 border-t border-charcoal-800 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 font-mono">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
              <span className="text-slate-300 font-semibold">{isConnected ? 'Connected' : 'Disconnected'}</span>
            </div>

            {senderInfo?.primaryUrl && (
              <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-400 hidden sm:flex">
                <Wifi className="w-3 h-3 text-cyanAccent-400" />
                <span>Host: {senderInfo.primaryUrl}</span>
              </div>
            )}

            <div className="flex items-center gap-1 text-[11px] font-mono text-slate-400">
              <Layers className="w-3 h-3 text-slate-400" />
              <span>{cacheCount} audio buffer(s) cached</span>
            </div>
          </div>

          <span className={`px-3 py-1 rounded-xl text-xs font-mono font-bold uppercase border ${currentState.color}`}>
            {currentState.text}
          </span>
        </div>
      </div>

      {/* In-App Camera QR Code Scanner Overlay */}
      {isScanningQr && (
        <div className="bg-charcoal-900 border border-brand-500/40 rounded-2xl p-5 shadow-2xl relative space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Camera className="w-4 h-4 text-brand-400" />
              <h4 className="text-sm font-bold text-white">Scan Sender QR Code</h4>
            </div>
            <button
              onClick={stopCameraScanner}
              className="p-1.5 rounded-lg bg-charcoal-800 hover:bg-charcoal-700 text-slate-400 hover:text-white transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {cameraError ? (
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300">
              {cameraError}
            </div>
          ) : (
            <div className="relative rounded-xl overflow-hidden bg-black aspect-video max-w-md mx-auto flex items-center justify-center border border-charcoal-700">
              <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
              <div className="absolute inset-0 border-2 border-brand-500/60 rounded-xl pointer-events-none m-8 flex items-center justify-center">
                <div className="w-full h-0.5 bg-brand-400/80 animate-pulse" />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Point camera at the host's QR code on laptop or TV.</span>
            <button
              onClick={stopCameraScanner}
              className="text-xs font-bold text-slate-300 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Audio Unlock Overlay Banner on mobile if suspended */}
      {!isAudioUnlocked && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 shrink-0 text-amber-400" />
            <span className="text-xs font-medium">
              Web Audio requires a user tap to prime speaker hardware and unlock synchronized output.
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

      {/* Stream / Codec Error Alert */}
      {(engineState === 'error' || lastErrorMessage) && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center justify-between gap-3 shadow-md animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
            <div className="text-xs">
              <span className="font-bold block">Audio Stream Notice</span>
              <span>{lastErrorMessage || 'Failed to stream audio file from sender host.'}</span>
            </div>
          </div>
          {onClearError && (
            <button
              onClick={onClearError}
              className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-semibold rounded-xl border border-rose-500/30 transition shrink-0 active:scale-95"
            >
              Dismiss
            </button>
          )}
        </div>
      )}

      {/* Buffer Status & Health Progress */}
      {engineState === 'buffering' && (
        <div className="p-4 rounded-2xl bg-charcoal-900 border border-amber-500/20 shadow-md space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-amber-300 flex items-center gap-2">
              <RotateCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
              <span>Buffering high-fidelity audio stream from host...</span>
            </span>
            <span className="font-mono font-bold text-amber-400">{bufferProgress}%</span>
          </div>
          <div className="w-full bg-charcoal-800 h-2 rounded-full overflow-hidden">
            <div
              className="bg-amber-400 h-full transition-all duration-150"
              style={{ width: `${bufferProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Precision Synchronization Quality Badge */}
      <SyncMetricsBadge metrics={syncMetrics} syncErrorMs={syncErrorMs} />

      {/* Active Phase Drift Correction Banner */}
      {isPlaying && driftCorrectionInfo?.active && (
        <div className="p-3.5 rounded-xl bg-cyanAccent-500/10 border border-cyanAccent-500/30 text-cyanAccent-300 flex items-center justify-between text-xs animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-cyanAccent-400 animate-pulse shrink-0" />
            <span>
              <strong>Acoustic Drift Correction Active:</strong> Micro-nudging playback rate to{' '}
              <span className="font-mono font-bold text-white bg-charcoal-850 px-1.5 py-0.5 rounded border border-cyanAccent-500/40">
                {driftCorrectionInfo.rate.toFixed(3)}x
              </span>{' '}
              to eliminate phase deviation without audio artifacts.
            </span>
          </div>
          <span className="font-mono font-bold text-cyanAccent-400 shrink-0 ml-2">
            {syncErrorMs !== undefined ? `${syncErrorMs > 0 ? '+' : ''}${syncErrorMs}ms` : ''}
          </span>
        </div>
      )}

      {/* Bluetooth Latency Advisory */}
      {outputType === 'bluetooth' && (
        <div className="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2.5">
            <Headphones className="w-4 h-4 text-indigo-400 shrink-0" />
            <span>
              <strong>Bluetooth Output Active:</strong> Wireless A2DP hardware buffers introduce 120–220ms latency.
              EchoCast has applied a <strong>+{manualOffsetMs}ms</strong> compensation preset. Fine-tune with the slider below if needed.
            </span>
          </div>
        </div>
      )}

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

        {/* Local Volume Controls & Test Sound */}
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

        {/* Audio Output Hardware Selector if available */}
        {audioDevices.length > 0 && (
          <div className="bg-charcoal-850 p-4 rounded-xl border border-charcoal-750 space-y-2">
            <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
              <span>Hardware Audio Sink:</span>
              <span className="text-[10px] font-mono text-slate-500">{audioDevices.length} devices detected</span>
            </label>
            <select
              value={selectedDeviceId}
              onChange={(e) => handleSelectOutputDevice(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-charcoal-800 border border-charcoal-700 text-xs text-white focus:outline-none focus:border-brand-500"
            >
              <option value="default">Default System Audio Output</option>
              {audioDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Audio Output ${d.deviceId.slice(0, 8)}`}
                </option>
              ))}
            </select>
          </div>
        )}

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
