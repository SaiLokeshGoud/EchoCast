import React from 'react';
import {
  Radio,
  Headphones,
  Wifi,
  Zap,
  Sliders,
  ShieldCheck,
  Smartphone,
  ChevronRight,
} from 'lucide-react';
import { ServerRuntimeStatus } from '@echocast/shared';

interface Props {
  onStartStreaming: () => void;
  onJoinStream: () => void;
  serverStatus: ServerRuntimeStatus | null;
  connectedReceiversCount: number;
}

export const WelcomeScreen: React.FC<Props> = ({
  onStartStreaming,
  onJoinStream,
  serverStatus,
  connectedReceiversCount,
}) => {
  const primaryIp = serverStatus?.primaryUrl?.replace(/^https?:\/\//, '') || 'Local Network';
  const isHotspot = serverStatus?.isHotspotDetected || false;

  return (
    <div className="max-w-5xl mx-auto py-8 sm:py-12 px-4 space-y-12 animate-in fade-in duration-300">
      {/* Hero Section */}
      <div className="text-center space-y-6 max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-charcoal-850 border border-charcoal-750 text-xs font-semibold text-brand-400 shadow-sm">
          <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
          <span>Local-First Audio Engine • Zero Internet Required</span>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-charcoal-800 border border-charcoal-700 flex items-center justify-center text-brand-400 shadow-inner">
              <Radio className="w-7 h-7" />
            </div>
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white">
              Echo<span className="text-brand-500">Cast</span>
            </h1>
          </div>
          <p className="text-lg sm:text-xl font-medium text-slate-300">
            Multi-Device Synchronized Audio Streaming
          </p>
          <p className="text-sm sm:text-base text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Stream studio-quality audio in real time from one sender to 5–10 phones, laptops, and speakers over your local Wi-Fi or mobile hotspot with sub-10ms precision synchronization.
          </p>
        </div>

        {/* Primary Call-to-Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <button
            onClick={onStartStreaming}
            className="w-full sm:w-auto min-w-[220px] px-6 py-4 rounded-xl bg-brand-500 hover:bg-brand-600 text-charcoal-950 font-bold text-sm shadow-lg shadow-brand-500/15 transition-all duration-150 flex items-center justify-center gap-2.5 active:scale-98"
          >
            <Radio className="w-5 h-5 text-charcoal-950" />
            <span>Start Streaming (Sender)</span>
            <ChevronRight className="w-4 h-4 ml-1 opacity-75" />
          </button>

          <button
            onClick={onJoinStream}
            className="w-full sm:w-auto min-w-[220px] px-6 py-4 rounded-xl bg-charcoal-850 hover:bg-charcoal-800 border border-charcoal-700 text-white font-semibold text-sm shadow-md transition-all duration-150 flex items-center justify-center gap-2.5 active:scale-98"
          >
            <Headphones className="w-5 h-5 text-cyanAccent-400" />
            <span>Join a Stream (Receiver)</span>
            <ChevronRight className="w-4 h-4 ml-1 opacity-60" />
          </button>
        </div>
      </div>

      {/* Network Readiness Status Banner */}
      <div className="bg-charcoal-900 border border-charcoal-750 rounded-2xl p-5 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 w-full sm:w-auto">
          <div className="w-10 h-10 rounded-xl bg-charcoal-850 border border-charcoal-750 flex items-center justify-center text-brand-400 shrink-0">
            <Wifi className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white uppercase tracking-wider">Local Network Status</span>
              {isHotspot ? (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-bold">
                  Hotspot Mode
                </span>
              ) : (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-bold">
                  Wi-Fi Ready
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Available at: <span className="text-slate-200 font-semibold">{primaryIp}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono text-slate-400 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 border-charcoal-800 pt-3 sm:pt-0">
          <div>
            <span className="text-slate-500">Connected Receivers:</span>{' '}
            <span className="text-brand-400 font-bold">{connectedReceiversCount}</span>
          </div>
          <div className="h-4 w-px bg-charcoal-750" />
          <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
            <ShieldCheck className="w-4 h-4" />
            <span>100% Offline</span>
          </div>
        </div>
      </div>

      {/* Feature Pillar Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-charcoal-900 border border-charcoal-750 rounded-2xl p-6 space-y-3 hover:border-charcoal-700 transition">
          <div className="w-10 h-10 rounded-xl bg-charcoal-850 border border-charcoal-750 flex items-center justify-center text-brand-400">
            <Zap className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-white">Sub-10ms Synchronization</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            NTP-like precision time protocol over WebSocket continuously aligns device clocks and triggers Web Audio hardware timers synchronously.
          </p>
        </div>

        <div className="bg-charcoal-900 border border-charcoal-750 rounded-2xl p-6 space-y-3 hover:border-charcoal-700 transition">
          <div className="w-10 h-10 rounded-xl bg-charcoal-850 border border-charcoal-750 flex items-center justify-center text-cyanAccent-400">
            <Sliders className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-white">Bluetooth Latency Calibration</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Compensates for A2DP Bluetooth speaker buffering (+160ms preset) with fine-tuning down to 5 milliseconds so every speaker sounds in phase.
          </p>
        </div>

        <div className="bg-charcoal-900 border border-charcoal-750 rounded-2xl p-6 space-y-3 hover:border-charcoal-700 transition">
          <div className="w-10 h-10 rounded-xl bg-charcoal-850 border border-charcoal-750 flex items-center justify-center text-slate-300">
            <Smartphone className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-white">Any Device, Zero Install</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Instant playback on Android phones, iPhones, iPads, Windows, Mac, and Linux browsers with one-scan QR code pairing.
          </p>
        </div>
      </div>
    </div>
  );
};
