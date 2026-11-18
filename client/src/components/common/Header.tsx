import React from 'react';
import { DeviceRole } from '@echocast/shared';
import { Radio, Headphones, QrCode, AlertCircle, CheckCircle2, Volume2, VolumeX } from 'lucide-react';
import { WsConnectionStatus } from '../../core/network/wsClient';

interface Props {
  role: DeviceRole;
  onRoleChange: (newRole: DeviceRole) => void;
  connectionStatus: WsConnectionStatus;
  primaryUrl: string;
  onOpenQrModal: () => void;
  isAudioUnlocked: boolean;
  onUnlockAudio: () => Promise<boolean>;
}

export const Header: React.FC<Props> = ({
  role,
  onRoleChange,
  connectionStatus,
  primaryUrl: _primaryUrl,
  onOpenQrModal,
  isAudioUnlocked,
  onUnlockAudio,
}) => {
  const statusConfig = {
    connected: {
      color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      icon: CheckCircle2,
      label: 'Connected',
    },
    connecting: {
      color: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      icon: Radio,
      label: 'Connecting...',
    },
    reconnecting: {
      color: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      icon: Radio,
      label: 'Reconnecting...',
    },
    disconnected: {
      color: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
      icon: AlertCircle,
      label: 'Disconnected',
    },
  };

  const status = statusConfig[connectionStatus] || statusConfig.disconnected;
  const StatusIcon = status.icon;

  return (
    <header className="sticky top-0 z-30 w-full bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-brand-500/20 text-white">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black tracking-tight text-white">EchoCast</h1>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-300 font-mono">
                v1.0
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">Multi-Device Synchronized Audio</p>
          </div>
        </div>

        {/* Role Switcher Pill */}
        <div className="flex items-center bg-slate-950/80 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => onRoleChange('sender')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              role === 'sender'
                ? 'bg-brand-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Sender</span>
          </button>
          <button
            onClick={() => onRoleChange('receiver')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              role === 'receiver'
                ? 'bg-brand-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Headphones className="w-3.5 h-3.5" />
            <span>Receiver</span>
          </button>
        </div>

        {/* Status Badges & Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Audio Unlocked Pill */}
          <button
            onClick={() => !isAudioUnlocked && onUnlockAudio()}
            className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition ${
              isAudioUnlocked
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
            }`}
            title={isAudioUnlocked ? 'Web Audio Context Active' : 'Click to enable Web Audio'}
          >
            {isAudioUnlocked ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span>{isAudioUnlocked ? 'Audio Active' : 'Tap to Activate'}</span>
          </button>

          {/* Connection Status */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${status.color}`}
            title={`WebSocket: ${connectionStatus}`}
          >
            <StatusIcon className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">{status.label}</span>
          </div>

          {/* QR Code / Share Pairing Button */}
          <button
            onClick={onOpenQrModal}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl border border-slate-700 transition"
            title="Scan QR code on receiver devices"
          >
            <QrCode className="w-4 h-4 text-brand-400" />
            <span className="hidden lg:inline">Pair Devices</span>
          </button>
        </div>
      </div>
    </header>
  );
};
