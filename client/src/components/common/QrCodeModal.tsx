import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Copy, Check, Wifi, Radio, Smartphone } from 'lucide-react';
import { NetworkInterfaceInfo } from '@echocast/shared';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  interfaces: NetworkInterfaceInfo[];
  primaryUrl: string;
}

export const QrCodeModal: React.FC<Props> = ({ isOpen, onClose, interfaces, primaryUrl }) => {
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [selectedUrl, setSelectedUrl] = useState<string>(primaryUrl || window.location.origin);

  if (!isOpen) return null;

  const currentDisplayUrl = selectedUrl || primaryUrl || window.location.origin;

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-5">
          <div className="inline-flex p-2.5 rounded-full bg-brand-500/10 text-brand-400 mb-2">
            <Radio className="w-6 h-6 animate-pulse" />
          </div>
          <h3 className="text-lg font-bold text-white">Connect Receivers</h3>
          <p className="text-xs text-slate-400 mt-1">
            Scan this QR code with any phone's camera on the same Wi-Fi or Mobile Hotspot to join playback instantly!
          </p>
        </div>

        {/* QR Code Container */}
        <div className="flex flex-col items-center justify-center p-4 bg-white rounded-xl shadow-inner mb-5">
          <QRCodeSVG
            value={currentDisplayUrl}
            size={190}
            level="M"
            includeMargin={false}
          />
          <span className="text-[11px] font-mono font-medium text-slate-700 mt-2 truncate max-w-full">
            {currentDisplayUrl}
          </span>
        </div>

        {/* Connection Interfaces List */}
        <div className="space-y-2 mb-4">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Wifi className="w-3.5 h-3.5 text-brand-400" />
            <span>Available Network Addresses</span>
          </div>

          <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
            {interfaces.map((iface) => {
              const isSelected = selectedUrl === iface.url;
              return (
                <div
                  key={iface.url}
                  onClick={() => setSelectedUrl(iface.url)}
                  className={`flex items-center justify-between p-2.5 rounded-lg border text-xs cursor-pointer transition ${
                    isSelected
                      ? 'bg-brand-500/20 border-brand-500/60 text-white'
                      : 'bg-slate-800/60 border-slate-700 hover:bg-slate-800 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {iface.isHotspot ? (
                      <Smartphone className="w-4 h-4 text-amber-400 shrink-0" />
                    ) : (
                      <Wifi className="w-4 h-4 text-brand-400 shrink-0" />
                    )}
                    <div className="truncate">
                      <div className="font-semibold flex items-center gap-1.5">
                        <span className="truncate">{iface.name}</span>
                        {iface.isHotspot && (
                          <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded font-mono">
                            Hotspot
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-[11px] opacity-75 truncate">{iface.url}</div>
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopy(iface.url);
                    }}
                    className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition shrink-0"
                    title="Copy URL"
                  >
                    {copiedUrl === iface.url ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-3 text-[11px] text-slate-400 space-y-1">
          <div className="font-semibold text-slate-300 flex items-center gap-1">
            <Radio className="w-3 h-3 text-emerald-400" />
            <span>Mobile Hotspot Tips</span>
          </div>
          <p>
            1. Turn on Portable Hotspot on your phone or laptop (no mobile data or internet required).
          </p>
          <p>
            2. Connect other phones / laptops to that hotspot Wi-Fi.
          </p>
          <p>
            3. Open the highlighted IP above in browser (e.g. Chrome or Safari).
          </p>
        </div>
      </div>
    </div>
  );
};
