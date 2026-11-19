import React, { useState } from 'react';
import {
  Settings,
  Volume2,
  Wifi,
  Clock,
  RotateCw,
  Save,
  Check,
  Smartphone,
  Layers,
  Shield,
  Key,
  Database,
  Trash2,
} from 'lucide-react';
import { SyncMetrics, ServerRuntimeStatus, formatTimeMs } from '@echocast/shared';

interface Props {
  currentDeviceName: string;
  onUpdateDeviceName: (newName: string) => void;
  syncMetrics: SyncMetrics;
  onForceSync: () => void;
  serverStatus: ServerRuntimeStatus | null;
  bufferDelayMs: number;
  onUpdateBufferDelay: (delayMs: number) => void;
  audioSampleRate: number;
  onUpdateSampleRate: (rate: number) => void;
  cacheCount?: number;
  maxCacheEntries?: number;
  onClearCache?: () => void;
  onUpdateMaxCache?: (max: number) => void;
  authToken?: string;
  requireAuth?: boolean;
  onUpdateAuth?: (token: string, required: boolean) => void;
  onOpenNetworkGuide?: () => void;
}

export const SettingsScreen: React.FC<Props> = ({
  currentDeviceName,
  onUpdateDeviceName,
  syncMetrics,
  onForceSync,
  serverStatus,
  bufferDelayMs,
  onUpdateBufferDelay,
  audioSampleRate,
  onUpdateSampleRate,
  cacheCount = 1,
  maxCacheEntries = 3,
  onClearCache,
  onUpdateMaxCache,
  authToken = 'rtok_cast842',
  requireAuth = false,
  onUpdateAuth,
  onOpenNetworkGuide,
}) => {
  const [nameInput, setNameInput] = useState(currentDeviceName);
  const [savedNameSuccess, setSavedNameSuccess] = useState(false);
  const [tokenInput, setTokenInput] = useState(authToken);
  const [isAuthRequired, setIsAuthRequired] = useState(requireAuth);
  const [savedAuthSuccess, setSavedAuthSuccess] = useState(false);

  const handleSaveAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (onUpdateAuth) {
      onUpdateAuth(tokenInput.trim() || 'rtok_cast842', isAuthRequired);
      setSavedAuthSuccess(true);
      setTimeout(() => setSavedAuthSuccess(false), 2000);
    }
  };

  const handleSaveName = (e: React.FormEvent) => {
    e.preventDefault();
    if (nameInput.trim()) {
      onUpdateDeviceName(nameInput.trim());
      setSavedNameSuccess(true);
      setTimeout(() => setSavedNameSuccess(false), 2000);
    }
  };

  const bufferPresets = [
    { label: 'Low Latency', ms: 350, desc: 'For fast 5GHz Wi-Fi and wired networks' },
    { label: 'Balanced (Recommended)', ms: 650, desc: 'Optimal for mixed mobile devices & Bluetooth' },
    { label: 'High Stability', ms: 1000, desc: 'For congested 2.4GHz Wi-Fi or weak hotspots' },
  ];

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 space-y-6 animate-in fade-in duration-200">
      <div className="pb-2 border-b border-charcoal-750">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2.5">
          <Settings className="w-6 h-6 text-brand-400" />
          <span>Application Settings</span>
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Configure local audio buffering, device identity, network parameters, and precision clock synchronization.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Device Identity Settings */}
        <div className="bg-charcoal-900 border border-charcoal-750 rounded-2xl p-5 shadow-md space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-cyanAccent-400" />
            <span>Device Identity</span>
          </h3>

          <form onSubmit={handleSaveName} className="space-y-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1.5 font-medium">
                Device Display Name:
              </label>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                maxLength={32}
                placeholder="e.g. Living Room Speaker, Studio Laptop"
                className="w-full px-3.5 py-2.5 rounded-xl bg-charcoal-850 border border-charcoal-700 focus:border-brand-500 focus:outline-none text-white text-xs font-medium placeholder-slate-500 transition"
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                Visible to sender and other endpoints on the network.
              </span>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-charcoal-950 font-bold text-xs flex items-center gap-1.5 shadow transition active:scale-95"
              >
                {savedNameSuccess ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                <span>{savedNameSuccess ? 'Saved' : 'Save Name'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Audio Quality & Sample Rate */}
        <div className="bg-charcoal-900 border border-charcoal-750 rounded-2xl p-5 shadow-md space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-brand-400" />
            <span>Audio Quality</span>
          </h3>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1.5 font-medium">
                Hardware Target Sample Rate:
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => onUpdateSampleRate(44100)}
                  className={`p-3 rounded-xl border text-xs font-semibold flex flex-col items-center justify-center gap-1 transition ${
                    audioSampleRate === 44100
                      ? 'bg-brand-500/15 border-brand-500 text-white'
                      : 'bg-charcoal-850 border-charcoal-750 text-slate-400 hover:bg-charcoal-800'
                  }`}
                >
                  <span className="font-bold">44.1 kHz</span>
                  <span className="text-[10px] text-slate-400 font-mono">Standard CD Quality</span>
                </button>

                <button
                  type="button"
                  onClick={() => onUpdateSampleRate(48000)}
                  className={`p-3 rounded-xl border text-xs font-semibold flex flex-col items-center justify-center gap-1 transition ${
                    audioSampleRate === 48000
                      ? 'bg-brand-500/15 border-brand-500 text-white'
                      : 'bg-charcoal-850 border-charcoal-750 text-slate-400 hover:bg-charcoal-800'
                  }`}
                >
                  <span className="font-bold">48.0 kHz</span>
                  <span className="text-[10px] text-slate-400 font-mono">Pro Studio Audio</span>
                </button>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              Streams are decoded into 32-bit floating point PCM audio buffers for lossless multi-device fidelity.
            </p>
          </div>
        </div>

        {/* Buffer & Scheduling Configuration */}
        <div className="bg-charcoal-900 border border-charcoal-750 rounded-2xl p-5 shadow-md space-y-4 md:col-span-2">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyanAccent-400" />
            <span>Broadcast Buffer & Schedule Window</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {bufferPresets.map((preset) => {
              const isSelected = bufferDelayMs === preset.ms;
              return (
                <div
                  key={preset.ms}
                  onClick={() => onUpdateBufferDelay(preset.ms)}
                  className={`p-4 rounded-xl border cursor-pointer transition space-y-1.5 ${
                    isSelected
                      ? 'bg-brand-500/15 border-brand-500 text-white shadow-sm'
                      : 'bg-charcoal-850 border-charcoal-750 hover:bg-charcoal-800 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs">{preset.label}</span>
                    <span className="font-mono text-xs font-bold text-brand-400">{preset.ms}ms</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-normal">{preset.desc}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Audio Buffer Memory & LRU Cache Management */}
        <div className="bg-charcoal-900 border border-charcoal-750 rounded-2xl p-5 shadow-md space-y-4 md:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Database className="w-4 h-4 text-brand-400" />
              <span>Audio Memory & LRU Buffer Cache</span>
            </h3>

            {onClearCache && (
              <button
                type="button"
                onClick={onClearCache}
                className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 font-semibold text-xs flex items-center gap-1.5 transition active:scale-95"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Cache</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3.5 rounded-xl bg-charcoal-850 border border-charcoal-750/70 space-y-1">
              <span className="text-slate-400 text-xs block font-medium">Cached In-Memory Tracks:</span>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold font-mono text-white">{cacheCount}</span>
                <span className="text-xs text-slate-500">/ {maxCacheEntries} max slots</span>
              </div>
              <p className="text-[11px] text-slate-500">
                Decoded PCM audio buffers are kept in an LRU cache to avoid repeated HTTP network transfers.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-charcoal-850 border border-charcoal-750/70 space-y-2">
              <span className="text-slate-400 text-xs block font-medium">LRU Cache Capacity:</span>
              <div className="grid grid-cols-3 gap-2">
                {[2, 3, 5].map((capacity) => (
                  <button
                    key={capacity}
                    type="button"
                    onClick={() => onUpdateMaxCache && onUpdateMaxCache(capacity)}
                    className={`py-1.5 rounded-lg border text-xs font-mono font-bold transition ${
                      maxCacheEntries === capacity
                        ? 'bg-brand-500/20 border-brand-500 text-white'
                        : 'bg-charcoal-800 border-charcoal-700 text-slate-400 hover:bg-charcoal-750'
                    }`}
                  >
                    {capacity} Tracks
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-500">
                Evicts least recently used audio tracks to prevent browser tab memory exhaustion on mobile devices.
              </p>
            </div>
          </div>
        </div>

        {/* Network Information */}
        <div className="bg-charcoal-900 border border-charcoal-750 rounded-2xl p-5 shadow-md space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Wifi className="w-4 h-4 text-brand-400" />
              <span>Network Information</span>
            </h3>

            {onOpenNetworkGuide && (
              <button
                onClick={onOpenNetworkGuide}
                className="px-2.5 py-1 rounded-lg bg-charcoal-800 hover:bg-charcoal-750 border border-charcoal-700 text-xs text-brand-400 font-semibold transition"
              >
                Hotspot Guide
              </button>
            )}
          </div>

          <div className="space-y-2 text-xs font-mono">
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-charcoal-850 border border-charcoal-750/70">
              <span className="text-slate-400">Primary Endpoint:</span>
              <span className="text-white font-bold">{serverStatus?.primaryUrl || '127.0.0.1:4000'}</span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-charcoal-850 border border-charcoal-750/70">
              <span className="text-slate-400">Hotspot Subnet:</span>
              <span className={serverStatus?.isHotspotDetected ? 'text-amber-400 font-bold' : 'text-slate-300'}>
                {serverStatus?.isHotspotDetected ? 'Detected Active' : 'Standard Wi-Fi'}
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-charcoal-850 border border-charcoal-750/70">
              <span className="text-slate-400">Server Uptime:</span>
              <span className="text-slate-300">{serverStatus?.serverUptimeSec || 0} seconds</span>
            </div>
          </div>
        </div>

        {/* Room Security & Authentication */}
        <div className="bg-charcoal-900 border border-charcoal-750 rounded-2xl p-5 shadow-md space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span>Room Authentication & Security</span>
            </h3>

            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-300">
              <input
                type="checkbox"
                checked={isAuthRequired}
                onChange={(e) => setIsAuthRequired(e.target.checked)}
                className="rounded border-charcoal-700 bg-charcoal-800 text-brand-500 focus:ring-brand-500"
              />
              <span>Require Passcode</span>
            </label>
          </div>

          <form onSubmit={handleSaveAuth} className="space-y-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1.5 font-medium">
                Room Joining Passcode / Token:
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  maxLength={32}
                  placeholder="e.g. rtok_cast842"
                  className="w-full px-3.5 py-2.5 pl-9 rounded-xl bg-charcoal-850 border border-charcoal-700 focus:border-brand-500 focus:outline-none text-white text-xs font-mono font-bold tracking-wider placeholder-slate-500 transition"
                />
                <Key className="w-4 h-4 text-slate-500 absolute left-3 top-3 pointer-events-none" />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                {isAuthRequired
                  ? 'Receivers must provide this passcode to connect.'
                  : 'Passcode validation currently optional.'}
              </span>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-charcoal-950 font-bold text-xs flex items-center gap-1.5 shadow transition active:scale-95"
              >
                {savedAuthSuccess ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                <span>{savedAuthSuccess ? 'Saved' : 'Update Auth'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Synchronization Diagnostics */}
        <div className="bg-charcoal-900 border border-charcoal-750 rounded-2xl p-5 shadow-md space-y-4 md:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyanAccent-400" />
              <span>Precision Time Sync Diagnostics</span>
            </h3>

            <button
              onClick={onForceSync}
              className="px-2.5 py-1 rounded-lg bg-charcoal-800 hover:bg-charcoal-750 border border-charcoal-700 text-xs text-slate-300 font-medium flex items-center gap-1.5 transition"
            >
              <RotateCw className="w-3.5 h-3.5 text-brand-400" />
              <span>Re-sync Clock</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
            <div className="p-2.5 rounded-lg bg-charcoal-850 border border-charcoal-750/70">
              <span className="text-slate-400 block text-[10px]">Clock Offset:</span>
              <span className="text-white font-bold">{formatTimeMs(syncMetrics.clockOffsetMs)}</span>
            </div>

            <div className="p-2.5 rounded-lg bg-charcoal-850 border border-charcoal-750/70">
              <span className="text-slate-400 block text-[10px]">Round Trip Time:</span>
              <span className="text-white font-bold">{formatTimeMs(syncMetrics.roundTripTimeMs)}</span>
            </div>

            <div className="p-2.5 rounded-lg bg-charcoal-850 border border-charcoal-750/70">
              <span className="text-slate-400 block text-[10px]">Clock Jitter:</span>
              <span className="text-slate-300">±{formatTimeMs(syncMetrics.jitterMs)}</span>
            </div>

            <div className="p-2.5 rounded-lg bg-charcoal-850 border border-charcoal-750/70">
              <span className="text-slate-400 block text-[10px]">NTP Samples:</span>
              <span className="text-brand-400 font-bold">{syncMetrics.samplesCount} bursts</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
