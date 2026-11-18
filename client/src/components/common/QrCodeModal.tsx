import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Copy, Check, Wifi, Radio, Smartphone } from 'lucide-react';
import { NetworkInterfaceInfo } from '@echocast/shared';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  interfaces: NetworkInterfaceInfo[];
  primaryUrl: string;
  roomId?: string;
}

export const QrCodeModal: React.FC<Props> = ({ isOpen, onClose, interfaces, primaryUrl, roomId = 'CAST-842' }) => {
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [copiedRoom, setCopiedRoom] = useState<boolean>(false);
  const [selectedUrl, setSelectedUrl] = useState<string>(primaryUrl || window.location.origin);

  if (!isOpen) return null;

  const baseUrl = selectedUrl || primaryUrl || window.location.origin;
  const qrTargetUrl = `${baseUrl}/?room=${encodeURIComponent(roomId)}&role=receiver`;

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2500);
  };

  const handleCopyRoomCode = () => {
    navigator.clipboard.writeText(roomId);
    setCopiedRoom(true);
    setTimeout(() => setCopiedRoom(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-charcoal-900 border border-charcoal-750 rounded-2xl p-6 shadow-2xl space-y-5">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-charcoal-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center space-y-1">
          <div className="inline-flex p-2 rounded-xl bg-charcoal-850 border border-charcoal-750 text-brand-400 mb-1">
            <Radio className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-bold text-white">Join Stream Room</h3>
          <p className="text-xs text-slate-400">
            Scan this QR code with any phone's camera on the same Wi-Fi or Hotspot to join instantly!
          </p>
        </div>

        {/* Room Code Badge */}
        <div className="flex items-center justify-between p-3 bg-charcoal-850 border border-charcoal-750 rounded-xl">
          <div className="text-xs">
            <span className="text-slate-500 uppercase tracking-wider block font-medium">Room Code</span>
            <span className="text-base font-bold font-mono text-brand-400">{roomId}</span>
          </div>

          <button
            onClick={handleCopyRoomCode}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-charcoal-800 hover:bg-charcoal-750 border border-charcoal-700 text-xs font-semibold text-slate-200 transition"
          >
            {copiedRoom ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedRoom ? 'Copied' : 'Copy Code'}</span>
          </button>
        </div>

        {/* QR Code Container */}
        <div className="flex flex-col items-center justify-center p-5 bg-white rounded-2xl shadow-inner">
          <QRCodeSVG
            value={qrTargetUrl}
            size={180}
            level="M"
            includeMargin={false}
          />
          <span className="text-[11px] font-mono font-medium text-slate-700 mt-3 truncate max-w-full text-center">
            {qrTargetUrl}
          </span>
        </div>

        {/* Network Interfaces List */}
        <div className="space-y-2">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Wifi className="w-3.5 h-3.5 text-brand-400" />
            <span>Available Network Addresses</span>
          </div>

          <div className="max-h-32 overflow-y-auto space-y-1.5 pr-1">
            {interfaces.map((iface) => {
              const isSelected = selectedUrl === iface.url;
              return (
                <div
                  key={iface.url}
                  onClick={() => setSelectedUrl(iface.url)}
                  className={`flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer transition ${
                    isSelected
                      ? 'bg-brand-500/15 border-brand-500/60 text-white'
                      : 'bg-charcoal-850 border-charcoal-750 hover:bg-charcoal-800 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {iface.isHotspot ? (
                      <Smartphone className="w-4 h-4 text-amber-400 shrink-0" />
                    ) : (
                      <Wifi className="w-4 h-4 text-brand-400 shrink-0" />
                    )}
                    <div className="truncate">
                      <div className="font-semibold flex items-center gap-1.5 truncate">
                        <span className="truncate">{iface.name}</span>
                        {iface.isHotspot && (
                          <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded font-mono font-bold">
                            Hotspot
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-[11px] text-slate-400 truncate">{iface.url}</div>
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopy(`${iface.url}/?room=${encodeURIComponent(roomId)}&role=receiver`);
                    }}
                    className="p-1.5 rounded-lg hover:bg-charcoal-750 text-slate-400 hover:text-white transition shrink-0"
                    title="Copy Link"
                  >
                    {copiedUrl?.includes(iface.url) ? (
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

        {/* Hotspot & Wi-Fi Tip */}
        <div className="bg-charcoal-850 border border-charcoal-750 rounded-xl p-3 text-[11px] text-slate-400 space-y-1">
          <p className="font-semibold text-slate-300 flex items-center gap-1">
            <Radio className="w-3 h-3 text-brand-400" />
            <span>Mobile Hotspot (No Internet)</span>
          </p>
          <p>
            Connect other phones or laptops to this device's Portable Hotspot Wi-Fi, then scan the QR code to stream.
          </p>
        </div>
      </div>
    </div>
  );
};
