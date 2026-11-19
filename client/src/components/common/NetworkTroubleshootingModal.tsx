import React, { useState } from 'react';
import {
  X,
  Wifi,
  Radio,
  Smartphone,
  Laptop,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Info,
  Copy,
  Check,
} from 'lucide-react';
import { NetworkInterfaceInfo } from '@echocast/shared';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  interfaces: NetworkInterfaceInfo[];
  primaryUrl: string;
  isHotspotDetected: boolean;
}

type TabType = 'hotspot' | 'router' | 'desktop' | 'firewall' | 'diagnostics';

export const NetworkTroubleshootingModal: React.FC<Props> = ({
  isOpen,
  onClose,
  interfaces,
  primaryUrl,
  isHotspotDetected,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('hotspot');
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-charcoal-900 border border-charcoal-750 rounded-2xl p-6 shadow-2xl space-y-5 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-charcoal-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-charcoal-850 border border-charcoal-700 text-brand-400">
              <Wifi className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Local Network & Hotspot Guide</h3>
              <p className="text-xs text-slate-400">Zero-Internet local communication troubleshooting</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-charcoal-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1.5 p-1 bg-charcoal-850 rounded-xl border border-charcoal-750 overflow-x-auto shrink-0 text-xs">
          <button
            onClick={() => setActiveTab('hotspot')}
            className={`px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap transition flex items-center gap-1.5 ${
              activeTab === 'hotspot'
                ? 'bg-brand-500 text-charcoal-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Mobile Hotspot</span>
          </button>

          <button
            onClick={() => setActiveTab('router')}
            className={`px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap transition flex items-center gap-1.5 ${
              activeTab === 'router'
                ? 'bg-brand-500 text-charcoal-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Wi-Fi Router</span>
          </button>

          <button
            onClick={() => setActiveTab('desktop')}
            className={`px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap transition flex items-center gap-1.5 ${
              activeTab === 'desktop'
                ? 'bg-brand-500 text-charcoal-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Laptop className="w-3.5 h-3.5" />
            <span>Laptop Hotspot</span>
          </button>

          <button
            onClick={() => setActiveTab('firewall')}
            className={`px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap transition flex items-center gap-1.5 ${
              activeTab === 'firewall'
                ? 'bg-brand-500 text-charcoal-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Firewall & Permissions</span>
          </button>

          <button
            onClick={() => setActiveTab('diagnostics')}
            className={`px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap transition flex items-center gap-1.5 ${
              activeTab === 'diagnostics'
                ? 'bg-brand-500 text-charcoal-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Diagnostics</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs text-slate-300">
          {/* TAB 1: Mobile Hotspot */}
          {activeTab === 'hotspot' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-300 flex items-start gap-2.5">
                <Info className="w-4 h-4 shrink-0 text-brand-400 mt-0.5" />
                <span>
                  Mobile Hotspots provide the best synchronization stability because traffic does not compete with heavy router traffic. Internet access is <strong>NOT</strong> required!
                </span>
              </div>

              {/* Android Steps */}
              <div className="bg-charcoal-850 border border-charcoal-750 rounded-xl p-4 space-y-2.5">
                <h4 className="font-bold text-white text-sm flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>Android Hotspot Setup (Subnet 192.168.43.x)</span>
                </h4>
                <ol className="list-decimal list-inside space-y-1.5 text-slate-300 pl-1">
                  <li>Open phone <strong>Settings &gt; Network &amp; Internet &gt; Hotspot &amp; Tethering</strong>.</li>
                  <li>Enable <strong>Wi-Fi Hotspot</strong>. (Optionally choose 5 GHz for sub-5ms latency).</li>
                  <li>Connect the Sender computer and all receiver phones to this hotspot SSID.</li>
                  <li>Launch EchoCast on the sender. The sender will automatically detect the hotspot IP.</li>
                  <li>Open the displayed URL or scan the pairing QR code from the receivers.</li>
                </ol>
              </div>

              {/* iPhone Steps */}
              <div className="bg-charcoal-850 border border-charcoal-750 rounded-xl p-4 space-y-2.5">
                <h4 className="font-bold text-white text-sm flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-400" />
                  <span>iPhone Personal Hotspot Setup (Subnet 172.20.10.x)</span>
                </h4>
                <ol className="list-decimal list-inside space-y-1.5 text-slate-300 pl-1">
                  <li>Open iPhone <strong>Settings &gt; Personal Hotspot</strong>.</li>
                  <li>Toggle on <strong>Allow Others to Join</strong>.</li>
                  <li>Enable <strong>Maximize Compatibility</strong> (ensures universal Wi-Fi access).</li>
                  <li>Connect the sender and receivers to your iPhone hotspot.</li>
                  <li>Scan the pairing QR code to stream in synchronized phase.</li>
                </ol>
              </div>
            </div>
          )}

          {/* TAB 2: Wi-Fi Router & AP Isolation */}
          {activeTab === 'router' && (
            <div className="space-y-4">
              <div className="bg-charcoal-850 border border-charcoal-750 rounded-xl p-4 space-y-2.5">
                <h4 className="font-bold text-white text-sm flex items-center gap-2">
                  <Radio className="w-4 h-4 text-brand-400" />
                  <span>Standard Home Wi-Fi Router Setup</span>
                </h4>
                <p>
                  Connect all devices to your primary home Wi-Fi SSID. EchoCast will detect your LAN IP (e.g. <code>192.168.1.30:4000</code>).
                </p>
              </div>

              {/* AP Isolation Warning */}
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 space-y-2">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span>Important: Watch Out for "AP Client Isolation"</span>
                </div>
                <p className="leading-relaxed">
                  On some public networks (hotels, cafes, airports, student dorms, corporate guest Wi-Fi), router administrators enable <strong>AP Isolation / Client Isolation</strong>. This feature intentionally prevents devices on the same Wi-Fi from communicating directly with each other.
                </p>
                <div className="pt-1 font-semibold text-white">
                  <strong>Solution:</strong> If phones cannot load the page or show connection timeout on public Wi-Fi, turn on a <strong>Mobile Hotspot</strong> on one phone or laptop and connect all devices to it instead.
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Desktop Hotspot */}
          {activeTab === 'desktop' && (
            <div className="space-y-4">
              <div className="bg-charcoal-850 border border-charcoal-750 rounded-xl p-4 space-y-2.5">
                <h4 className="font-bold text-white text-sm flex items-center gap-2">
                  <Laptop className="w-4 h-4 text-brand-400" />
                  <span>Windows 10/11 Mobile Hotspot (No Router Needed)</span>
                </h4>
                <ol className="list-decimal list-inside space-y-1.5 text-slate-300 pl-1">
                  <li>Open Windows <strong>Settings &gt; Network &amp; Internet &gt; Mobile Hotspot</strong>.</li>
                  <li>Turn on <strong>Mobile Hotspot</strong>.</li>
                  <li>Set *Share my connection over* to <strong>Wi-Fi</strong>.</li>
                  <li>Connect receiver phones to your laptop's Wi-Fi network.</li>
                  <li>EchoCast will detect the virtual adapter IP (<code>192.168.137.1:4000</code>).</li>
                </ol>
              </div>

              <div className="bg-charcoal-850 border border-charcoal-750 rounded-xl p-4 space-y-2.5">
                <h4 className="font-bold text-white text-sm flex items-center gap-2">
                  <Laptop className="w-4 h-4 text-cyanAccent-400" />
                  <span>macOS Internet Sharing</span>
                </h4>
                <ol className="list-decimal list-inside space-y-1.5 text-slate-300 pl-1">
                  <li>Open <strong>System Settings &gt; General &gt; Sharing</strong>.</li>
                  <li>Click info icon on <strong>Internet Sharing</strong>, select <strong>Wi-Fi</strong>.</li>
                  <li>Turn on Internet Sharing and connect your phones to the Mac's Wi-Fi.</li>
                </ol>
              </div>
            </div>
          )}

          {/* TAB 4: Firewall & Local Network Permissions */}
          {activeTab === 'firewall' && (
            <div className="space-y-4">
              <div className="bg-charcoal-850 border border-charcoal-750 rounded-xl p-4 space-y-2.5">
                <h4 className="font-bold text-white text-sm flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-400" />
                  <span>Windows Defender Firewall</span>
                </h4>
                <p>
                  When prompted by Windows, make sure to check <strong>"Private Networks"</strong> and click <strong>Allow Access</strong>.
                </p>
                <div className="p-3 bg-charcoal-900 rounded-lg font-mono text-[11px] text-slate-300 border border-charcoal-750">
                  New-NetFirewallRule -DisplayName "EchoCast Local Stream" -Direction Inbound -LocalPort 4000 -Protocol TCP -Action Allow
                </div>
              </div>

              <div className="bg-charcoal-850 border border-charcoal-750 rounded-xl p-4 space-y-2.5">
                <h4 className="font-bold text-white text-sm flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-brand-400" />
                  <span>iOS "Local Network" Permission</span>
                </h4>
                <p>
                  When opening EchoCast in Safari on iPhone or iPad, iOS asks for permission to <em>"find and connect to devices on your local network"</em>. Tap <strong>Allow</strong>. If denied, enable it under <strong>Settings &gt; Safari &gt; Local Network</strong>.
                </p>
              </div>
            </div>
          )}

          {/* TAB 5: Live Network Diagnostics */}
          {activeTab === 'diagnostics' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-charcoal-850 border border-charcoal-750">
                <div className="text-xs">
                  <span className="text-slate-500 uppercase tracking-wider block font-semibold">Active Primary Access URL</span>
                  <span className="text-sm font-bold font-mono text-brand-400">{primaryUrl}</span>
                </div>
                <button
                  onClick={() => handleCopy(primaryUrl)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-charcoal-800 hover:bg-charcoal-700 text-slate-200 text-xs font-semibold rounded-lg transition"
                >
                  {copiedUrl === primaryUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedUrl === primaryUrl ? 'Copied' : 'Copy'}</span>
                </button>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                  Detected Network Interfaces ({interfaces.length})
                </span>

                <div className="space-y-1.5">
                  {interfaces.map((iface) => (
                    <div
                      key={iface.url}
                      className="p-3 bg-charcoal-850 border border-charcoal-750 rounded-xl flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white">{iface.name}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                            iface.isHotspot
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : iface.isWifi
                              ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30'
                              : 'bg-slate-800 text-slate-400'
                          }`}>
                            {iface.typeLabel || (iface.isHotspot ? 'HOTSPOT' : iface.isWifi ? 'WI-FI' : 'LAN')}
                          </span>
                        </div>
                        <span className="font-mono text-xs text-slate-400 block truncate">{iface.url}</span>
                      </div>

                      <button
                        onClick={() => handleCopy(iface.url)}
                        className="px-2.5 py-1 text-slate-400 hover:text-white rounded bg-charcoal-800 hover:bg-charcoal-700 text-xs font-medium shrink-0"
                      >
                        {copiedUrl === iface.url ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-3 bg-charcoal-850 rounded-xl border border-charcoal-750 flex items-center justify-between text-xs">
                <span className="text-slate-400">Hotspot Environment Status:</span>
                <span className={`font-mono font-bold ${isHotspotDetected ? 'text-amber-400' : 'text-slate-400'}`}>
                  {isHotspotDetected ? 'Hotspot Subnet Active' : 'Standard Router Subnet'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-charcoal-800 flex items-center justify-between shrink-0 text-xs text-slate-400">
          <span>Read complete documentation in <code>HOTSPOT_SETUP_GUIDE.md</code></span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-charcoal-800 hover:bg-charcoal-750 text-white font-semibold rounded-xl transition"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
};
