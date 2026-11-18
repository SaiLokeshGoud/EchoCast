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
}) => {
  const [nameInput, setNameInput] = useState(currentDeviceName);
  const [savedNameSuccess, setSavedNameSuccess] = useState(false);

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

        {/* Network Information */}
        <div className="bg-charcoal-900 border border-charcoal-750 rounded-2xl p-5 shadow-md space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Wifi className="w-4 h-4 text-brand-400" />
            <span>Network Information</span>
          </h3>

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

        {/* Synchronization Diagnostics */}
        <div className="bg-charcoal-900 border border-charcoal-750 rounded-2xl p-5 shadow-md space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyanAccent-400" />
              <span>Precision Time Sync</span>
            </h3>

            <button
              onClick={onForceSync}
              className="px-2.5 py-1 rounded-lg bg-charcoal-800 hover:bg-charcoal-750 border border-charcoal-700 text-xs text-slate-300 font-medium flex items-center gap-1.5 transition"
            >
              <RotateCw className="w-3.5 h-3.5 text-brand-400" />
              <span>Re-sync Clock</span>
            </button>
          </div>

          <div className="space-y-2 text-xs font-mono">
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-charcoal-850 border border-charcoal-750/70">
              <span className="text-slate-400">Clock Offset:</span>
              <span className="text-white font-bold">{formatTimeMs(syncMetrics.clockOffsetMs)}</span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-charcoal-850 border border-charcoal-750/70">
              <span className="text-slate-400">Round Trip Time:</span>
              <span className="text-white font-bold">{formatTimeMs(syncMetrics.roundTripTimeMs)}</span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-charcoal-850 border border-charcoal-750/70">
              <span className="text-slate-400">Clock Jitter:</span>
              <span className="text-slate-300">±{formatTimeMs(syncMetrics.jitterMs)}</span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-charcoal-850 border border-charcoal-750/70">
              <span className="text-slate-400">Sync Samples:</span>
              <span className="text-brand-400 font-bold">{syncMetrics.samplesCount} bursts</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
