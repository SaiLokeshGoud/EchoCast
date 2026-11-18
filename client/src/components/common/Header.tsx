import React from 'react';
import {
  Radio,
  Headphones,
  Users,
  Settings,
  Home,
  QrCode,
  Volume2,
  VolumeX,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
} from 'lucide-react';
import { WsConnectionStatus } from '../../core/network/wsClient';

export type AppScreen = 'welcome' | 'sender' | 'receiver' | 'devices' | 'settings';

interface Props {
  activeScreen: AppScreen;
  onNavigate: (screen: AppScreen) => void;
  connectionStatus: WsConnectionStatus;
  primaryUrl: string;
  roomId: string;
  receiverCount: number;
  onOpenQrModal: () => void;
  isAudioUnlocked: boolean;
  onUnlockAudio: () => Promise<boolean>;
}

export const Header: React.FC<Props> = ({
  activeScreen,
  onNavigate,
  connectionStatus,
  primaryUrl: _primaryUrl,
  roomId,
  receiverCount,
  onOpenQrModal,
  isAudioUnlocked,
  onUnlockAudio,
}) => {
  const [copiedRoom, setCopiedRoom] = React.useState(false);

  const handleCopyRoom = () => {
    navigator.clipboard.writeText(roomId);
    setCopiedRoom(true);
    setTimeout(() => setCopiedRoom(false), 2000);
  };

  const statusConfig = {
    connected: {
      color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      icon: CheckCircle2,
      label: 'Connected',
    },
    connecting: {
      color: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      icon: Radio,
      label: 'Connecting',
    },
    reconnecting: {
      color: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      icon: Radio,
      label: 'Reconnecting',
    },
    disconnected: {
      color: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
      icon: AlertCircle,
      label: 'Offline',
    },
  };

  const status = statusConfig[connectionStatus] || statusConfig.disconnected;
  const StatusIcon = status.icon;

  const navItems = [
    { id: 'welcome' as AppScreen, label: 'Home', icon: Home },
    { id: 'sender' as AppScreen, label: 'Sender', icon: Radio },
    { id: 'receiver' as AppScreen, label: 'Receiver', icon: Headphones },
    { id: 'devices' as AppScreen, label: 'Devices', icon: Users, badge: receiverCount > 0 ? receiverCount : undefined },
    { id: 'settings' as AppScreen, label: 'Settings', icon: Settings },
  ];

  return (
    <header className="sticky top-0 z-30 w-full bg-charcoal-900/95 backdrop-blur-md border-b border-charcoal-750">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
        {/* Logo & Brand */}
        <div
          onClick={() => onNavigate('welcome')}
          className="flex items-center gap-2.5 cursor-pointer shrink-0"
        >
          <div className="w-9 h-9 rounded-xl bg-charcoal-850 border border-charcoal-700 flex items-center justify-center text-brand-400 shadow-sm">
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <span className="text-base font-black tracking-tight text-white flex items-center gap-1">
              Echo<span className="text-brand-500">Cast</span>
            </span>
          </div>
        </div>

        {/* Center Navigation Tabs */}
        <nav className="flex items-center bg-charcoal-950 p-1 rounded-xl border border-charcoal-750/80 overflow-x-auto max-w-[calc(100vw-200px)]">
          {navItems.map((item) => {
            const isActive = activeScreen === item.id;
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-150 ${
                  isActive
                    ? 'bg-charcoal-850 text-white shadow-sm border border-charcoal-700/80'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-brand-400' : 'text-slate-400'}`} />
                <span className="hidden sm:inline">{item.label}</span>
                {item.badge !== undefined && (
                  <span className="w-4 h-4 rounded-full bg-brand-500 text-charcoal-950 text-[10px] font-bold flex items-center justify-center">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Right Action Items */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          {/* Room ID Tag */}
          <button
            onClick={handleCopyRoom}
            className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-charcoal-850 hover:bg-charcoal-800 border border-charcoal-750 text-xs font-mono text-slate-300 transition"
            title="Click to copy Room Code"
          >
            <span className="text-slate-500 text-[10px]">ROOM:</span>
            <span className="font-bold text-brand-400">{roomId}</span>
            {copiedRoom ? (
              <Check className="w-3 h-3 text-emerald-400 ml-0.5" />
            ) : (
              <Copy className="w-3 h-3 opacity-60 ml-0.5" />
            )}
          </button>

          {/* Web Audio Status Badge */}
          <button
            onClick={() => !isAudioUnlocked && onUnlockAudio()}
            className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition ${
              isAudioUnlocked
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20'
            }`}
            title={isAudioUnlocked ? 'Web Audio Active' : 'Click to enable Web Audio'}
          >
            {isAudioUnlocked ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span className="hidden xl:inline">{isAudioUnlocked ? 'Audio Active' : 'Tap to Activate'}</span>
          </button>

          {/* WebSocket Status Indicator */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${status.color}`}
            title={`WebSocket: ${connectionStatus}`}
          >
            <StatusIcon className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden md:inline font-mono text-[11px]">{status.label}</span>
          </div>

          {/* QR Code Trigger Button */}
          <button
            onClick={onOpenQrModal}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-charcoal-950 font-bold text-xs rounded-xl shadow-md transition active:scale-95"
            title="Scan QR code on receiver devices"
          >
            <QrCode className="w-4 h-4" />
            <span className="hidden sm:inline">Pair</span>
          </button>
        </div>
      </div>
    </header>
  );
};
