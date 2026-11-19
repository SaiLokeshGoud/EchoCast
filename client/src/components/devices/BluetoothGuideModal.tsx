import React, { useState } from 'react';
import {
  Headphones,
  Smartphone,
  Laptop,
  CheckCircle2,
  X,
  Sliders,
  AlertCircle,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type PlatformTab = 'android' | 'ios' | 'windows' | 'macos';

export const BluetoothGuideModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<PlatformTab>(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (/android/i.test(ua)) return 'android';
    if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
    if (/macintosh|mac os x/i.test(ua)) return 'macos';
    return 'windows';
  });

  if (!isOpen) return null;

  const isSinkIdSupported = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-charcoal-900 border border-charcoal-750 rounded-2xl p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-charcoal-750">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyanAccent-400">
              <Headphones className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Bluetooth Speaker Setup & Audio Routing</span>
              </h3>
              <p className="text-xs text-slate-400">
                Connect external speakers to any receiver and maintain synchronized acoustic playback.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-charcoal-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Operating System Policy Note */}
        <div className="p-3.5 bg-charcoal-850 border border-charcoal-700/80 rounded-xl space-y-1.5 text-xs">
          <div className="flex items-center gap-2 text-cyanAccent-400 font-bold">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Browser Audio Output Architecture</span>
          </div>
          <p className="text-slate-300 leading-relaxed text-[11px]">
            Web standards route audio through your operating system&apos;s active default sound device. Web browsers do not have low-level kernel permissions to scan or pair Bluetooth peripherals directly. Once paired in your OS settings, EchoCast automatically broadcasts synchronized sound through that speaker.
          </p>
          <div className="flex items-center gap-2 pt-1 font-mono text-[10px] text-slate-400">
            <span>Direct Browser Audio Sink Selection:</span>
            {isSinkIdSupported ? (
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Available in this browser
              </span>
            ) : (
              <span className="text-amber-400">Managed via OS Settings (Mobile Standard)</span>
            )}
          </div>
        </div>

        {/* Platform Selector Tabs */}
        <div className="flex items-center gap-2 p-1 bg-charcoal-950 border border-charcoal-800 rounded-xl">
          <button
            onClick={() => setActiveTab('android')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition ${
              activeTab === 'android'
                ? 'bg-charcoal-800 text-white shadow-sm border border-charcoal-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
            <span>Android</span>
          </button>

          <button
            onClick={() => setActiveTab('ios')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition ${
              activeTab === 'ios'
                ? 'bg-charcoal-800 text-white shadow-sm border border-charcoal-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 text-cyanAccent-400" />
            <span>iPhone / iPad</span>
          </button>

          <button
            onClick={() => setActiveTab('windows')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition ${
              activeTab === 'windows'
                ? 'bg-charcoal-800 text-white shadow-sm border border-charcoal-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Laptop className="w-3.5 h-3.5 text-blue-400" />
            <span>Windows</span>
          </button>

          <button
            onClick={() => setActiveTab('macos')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition ${
              activeTab === 'macos'
                ? 'bg-charcoal-800 text-white shadow-sm border border-charcoal-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Laptop className="w-3.5 h-3.5 text-purple-400" />
            <span>Mac (macOS)</span>
          </button>
        </div>

        {/* Tab Content: Step by step instructions */}
        <div className="bg-charcoal-850 border border-charcoal-750/70 rounded-xl p-4 space-y-3">
          {activeTab === 'android' && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                <span>Android Bluetooth Pairing Steps</span>
              </h4>
              <ol className="space-y-2 text-xs text-slate-300 list-decimal list-inside leading-relaxed">
                <li>Turn on your Bluetooth speaker and put it in <strong>Pairing Mode</strong>.</li>
                <li>On your phone, open <strong>Settings &gt; Connected devices &gt; Pair new device</strong> (or toggle Bluetooth on).</li>
                <li>Tap your speaker name to pair and connect.</li>
                <li>Tap the gear icon next to your speaker and confirm <strong>Media audio</strong> is toggled ON.</li>
                <li>Return to EchoCast and tap <strong>Bluetooth Output (+160ms)</strong> on the Receiver Dashboard to calibrate wireless A2DP delay.</li>
              </ol>
            </div>
          )}

          {activeTab === 'ios' && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-cyanAccent-400 uppercase tracking-wider flex items-center gap-2">
                <span>iPhone / iPad (iOS &amp; iPadOS) Routing Steps</span>
              </h4>
              <ol className="space-y-2 text-xs text-slate-300 list-decimal list-inside leading-relaxed">
                <li>Turn on your Bluetooth speaker and place it into pairing mode.</li>
                <li>Open <strong>Settings &gt; Bluetooth</strong> on your iPhone or iPad and tap your speaker to connect.</li>
                <li>Swipe down from the top-right corner to open <strong>iOS Control Center</strong>.</li>
                <li>Tap the <strong>AirPlay / Audio output</strong> triangle icon in the upper-right corner of the media playback card.</li>
                <li>Ensure the checkmark is next to your Bluetooth speaker.</li>
                <li>Tap the screen once in EchoCast if iOS pauses playback due to user-interaction security policies.</li>
              </ol>
            </div>
          )}

          {activeTab === 'windows' && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-2">
                <span>Windows 10 &amp; 11 Audio Setup</span>
              </h4>
              <ol className="space-y-2 text-xs text-slate-300 list-decimal list-inside leading-relaxed">
                <li>Open <strong>Settings &gt; Bluetooth &amp; devices &gt; Add device &gt; Bluetooth</strong>.</li>
                <li>Select and pair your external speaker or soundbar.</li>
                <li>Click the <strong>Speaker / Sound</strong> icon on the bottom right of the Windows taskbar.</li>
                <li>Click the sound output arrow (<strong>&gt;</strong>) and select your Bluetooth device as default playback.</li>
                <li>EchoCast will immediately route all synchronized playback through your Windows speaker.</li>
              </ol>
            </div>
          )}

          {activeTab === 'macos' && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-2">
                <span>Mac (macOS) Audio Routing</span>
              </h4>
              <ol className="space-y-2 text-xs text-slate-300 list-decimal list-inside leading-relaxed">
                <li>Open <strong>System Settings &gt; Bluetooth</strong> and connect your speaker.</li>
                <li>Click the <strong>Control Center</strong> or <strong>Sound</strong> icon in the macOS menu bar at the top right.</li>
                <li>Under <strong>Output</strong>, click to select your connected Bluetooth speaker.</li>
                <li>Audio will instantly route through the speaker in high-fidelity AAC or SBC.</li>
              </ol>
            </div>
          )}
        </div>

        {/* Latency Offset Section */}
        <div className="p-3.5 bg-cyan-950/20 border border-cyan-800/40 rounded-xl space-y-2">
          <div className="flex items-center gap-2 text-cyan-300 text-xs font-bold">
            <Sliders className="w-4 h-4 text-cyanAccent-400" />
            <span>Overcoming Bluetooth Latency (A2DP Compensation)</span>
          </div>
          <p className="text-[11px] text-slate-300 leading-relaxed">
            Bluetooth audio encoding adds approximately <strong>120ms to 220ms</strong> of wireless transmission delay. Because built-in laptop and phone speakers play instantly, an uncompensated Bluetooth speaker will sound like an echo.
          </p>
          <p className="text-[11px] text-cyan-200">
            💡 <strong>Pro-Tip:</strong> EchoCast includes a built-in <strong>+160ms preset</strong> on every receiver. When connecting a Bluetooth speaker, select &quot;Bluetooth&quot; as the output type, or use the fine-tuning slider to make it match your other speakers with millisecond precision!
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end pt-2">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-brand-500 hover:bg-brand-400 text-charcoal-950 font-bold text-xs shadow-md transition"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
};
