import React, { useState } from 'react';
import {
  DeviceInfo,
  formatTimeMs,
  evaluateSyncQuality,
  evaluateSyncHealthTag,
} from '@echocast/shared';
import {
  Users,
  Smartphone,
  Laptop,
  Speaker,
  Headphones,
  Volume2,
  VolumeX,
  UserX,
  Radio,
  CheckCircle2,
} from 'lucide-react';

interface Props {
  devices: DeviceInfo[];
  sender: DeviceInfo | undefined;
  onRemoteVolume: (deviceId: string, vol: number) => void;
  onRemoteMute: (deviceId: string, isMuted: boolean) => void;
  onDisconnectDevice: (deviceId: string) => void;
}

export const DeviceManagementScreen: React.FC<Props> = ({
  devices,
  sender,
  onRemoteVolume,
  onRemoteMute,
  onDisconnectDevice,
}) => {
  const [deviceToDisconnect, setDeviceToDisconnect] = useState<DeviceInfo | null>(null);

  const receivers = devices.filter((d) => d.role === 'receiver');
  const avgRtt = receivers.length
    ? receivers.reduce((sum, d) => sum + d.roundTripTimeMs, 0) / receivers.length
    : 0;

  const receiversWithSync = receivers.filter((d) => d.syncErrorMs !== undefined);
  const avgSyncError = receiversWithSync.length
    ? Math.round(
        receiversWithSync.reduce((sum, d) => sum + Math.abs(d.syncErrorMs || 0), 0) /
          receiversWithSync.length
      )
    : undefined;

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'android':
      case 'ios':
        return Smartphone;
      default:
        return Laptop;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'playing':
        return { label: 'Playing', color: 'bg-brand-500/10 text-brand-400 border-brand-500/20' };
      case 'ready':
      case 'connected':
        return { label: 'Ready', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' };
      case 'buffering':
        return { label: 'Buffering', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' };
      default:
        return { label: status, color: 'bg-slate-700/20 text-slate-400 border-slate-700/30' };
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 space-y-6 animate-in fade-in duration-200">
      {/* Header & Overview Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-charcoal-750">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <Users className="w-6 h-6 text-brand-400" />
            <span>Connected Devices</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage audio routing, volume balance, and active connections across all synchronized endpoints.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-charcoal-900 border border-charcoal-750 rounded-xl px-3.5 py-2 text-xs font-mono">
            <span className="text-slate-400">Total Receivers: </span>
            <span className="text-brand-400 font-bold">{receivers.length}</span>
          </div>
          <div className="bg-charcoal-900 border border-charcoal-750 rounded-xl px-3.5 py-2 text-xs font-mono">
            <span className="text-slate-400">Avg RTT: </span>
            <span className="text-cyanAccent-400 font-bold">{formatTimeMs(avgRtt)}</span>
          </div>
          {avgSyncError !== undefined && (
            <div className="bg-charcoal-900 border border-charcoal-750 rounded-xl px-3.5 py-2 text-xs font-mono">
              <span className="text-slate-400">Avg Sync Error: </span>
              <span className={avgSyncError <= 20 ? 'text-emerald-400 font-bold' : avgSyncError <= 50 ? 'text-teal-400 font-bold' : 'text-amber-400 font-bold'}>
                ±{avgSyncError}ms
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Disconnect Confirmation Modal */}
      {deviceToDisconnect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-sm bg-charcoal-900 border border-charcoal-750 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
              <UserX className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h3 className="text-base font-bold text-white">Disconnect Device?</h3>
              <p className="text-xs text-slate-400 mt-1">
                Are you sure you want to disconnect <span className="text-white font-semibold">{deviceToDisconnect.name}</span>? They will stop receiving the synchronized audio stream.
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setDeviceToDisconnect(null)}
                className="flex-1 px-4 py-2.5 rounded-xl bg-charcoal-800 hover:bg-charcoal-750 text-slate-300 font-semibold text-xs transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDisconnectDevice(deviceToDisconnect.id);
                  setDeviceToDisconnect(null);
                }}
                className="flex-1 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md transition"
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sender Node Card if present */}
      {sender && (
        <div className="bg-charcoal-900 border border-brand-500/30 rounded-2xl p-5 shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-500/15 border border-brand-500/30 flex items-center justify-center text-brand-400">
                <Radio className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white">{sender.name}</h3>
                  <span className="text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded bg-brand-500/20 text-brand-300">
                    Host Sender
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-mono">
                  IP: {sender.ipAddress || 'Host Machine'} • Platform: {sender.platform}
                </p>
              </div>
            </div>

            <span className="text-xs font-mono font-medium text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              <span>Broadcasting</span>
            </span>
          </div>
        </div>
      )}

      {/* Receivers Grid */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
          <span>Connected Receivers ({receivers.length})</span>
        </h3>

        {receivers.length === 0 ? (
          <div className="bg-charcoal-900 border border-charcoal-750 rounded-2xl p-12 text-center space-y-3">
            <Smartphone className="w-12 h-12 text-slate-600 mx-auto" />
            <h4 className="text-base font-bold text-slate-200">No Receiver Devices Connected</h4>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Devices that scan your QR code or open your room link will automatically appear here with live latency statistics and volume controls.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {receivers.map((device) => {
              const PlatformIcon = getPlatformIcon(device.platform);
              const statusBadge = getStatusBadge(device.status);
              const syncQuality = evaluateSyncQuality(device.clockOffsetMs, device.roundTripTimeMs);

              return (
                <div
                  key={device.id}
                  className="bg-charcoal-900 border border-charcoal-750 hover:border-charcoal-700 rounded-2xl p-5 shadow-md space-y-4 transition"
                >
                  {/* Top: Name & Badges */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-charcoal-850 border border-charcoal-750 flex items-center justify-center text-slate-300 shrink-0">
                        <PlatformIcon className="w-5 h-5 text-cyanAccent-400" />
                      </div>
                      <div className="truncate">
                        <h4 className="text-sm font-bold text-white truncate">{device.name}</h4>
                        <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
                          <span className="capitalize">{device.platform}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1 text-[11px] text-slate-300">
                            {device.outputType === 'bluetooth' ? (
                              <Headphones className="w-3 h-3 text-cyanAccent-400" />
                            ) : (
                              <Speaker className="w-3 h-3 text-brand-400" />
                            )}
                            <span className="capitalize">{device.outputType}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${statusBadge.color}`}>
                        {statusBadge.label}
                      </span>
                      {device.syncErrorMs !== undefined ? (
                        <span className={`text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded border ${
                          evaluateSyncHealthTag(device.syncErrorMs).color
                        }`}>
                          {evaluateSyncHealthTag(device.syncErrorMs).label}
                        </span>
                      ) : (
                        <span className="text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded border border-charcoal-700 text-slate-400 capitalize">
                          {syncQuality}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Latency & Sync Diagnostics */}
                  <div className="grid grid-cols-2 gap-2 p-3 bg-charcoal-850 border border-charcoal-750/70 rounded-xl text-xs font-mono">
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase block">Clock Offset</span>
                      <span className="text-slate-200 font-bold">{formatTimeMs(device.clockOffsetMs)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase block">RTT / Jitter</span>
                      <span className="text-slate-200 font-bold">
                        {formatTimeMs(device.roundTripTimeMs)}
                        <span className="text-[10px] text-slate-500 font-normal"> ±{formatTimeMs(device.jitterMs || 0)}</span>
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase block">Sync Deviation</span>
                      <span className={`font-bold ${
                        device.syncErrorMs === undefined
                          ? 'text-slate-400'
                          : Math.abs(device.syncErrorMs) <= 20
                          ? 'text-emerald-400'
                          : Math.abs(device.syncErrorMs) <= 50
                          ? 'text-teal-400'
                          : 'text-amber-400'
                      }`}>
                        {device.syncErrorMs !== undefined ? `${device.syncErrorMs > 0 ? '+' : ''}${device.syncErrorMs}ms` : 'Syncing'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase block">Buffer Cache</span>
                      <span className="text-slate-200 font-bold">
                        {device.bufferProgress !== undefined ? `${device.bufferProgress}%` : device.audioBufferReady ? '100%' : 'Ready'}
                      </span>
                    </div>
                  </div>

                  {/* Volume Control */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="text-[11px] font-medium">Output Volume</span>
                      <span className="font-mono font-bold text-slate-200">
                        {Math.round((device.isMuted ? 0 : device.volume) * 100)}%
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => onRemoteMute(device.id, !device.isMuted)}
                        className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-charcoal-800 transition"
                        title={device.isMuted ? 'Unmute' : 'Mute'}
                      >
                        {device.isMuted ? (
                          <VolumeX className="w-4 h-4 text-rose-400" />
                        ) : (
                          <Volume2 className="w-4 h-4 text-brand-400" />
                        )}
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.02}
                        value={device.isMuted ? 0 : device.volume}
                        onChange={(e) => onRemoteVolume(device.id, parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-charcoal-750 rounded-lg appearance-none cursor-pointer accent-brand-500"
                      />
                    </div>
                  </div>

                  {/* Disconnect Action & Health Tag */}
                  <div className="pt-2 border-t border-charcoal-750/60 flex items-center justify-between">
                    <span className="text-[11px] font-mono flex items-center gap-1.5">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${evaluateSyncHealthTag(device.syncErrorMs).badgeClass}`}>
                        {evaluateSyncHealthTag(device.syncErrorMs).label}
                      </span>
                    </span>

                    <button
                      onClick={() => setDeviceToDisconnect(device)}
                      className="px-2.5 py-1 rounded-lg bg-charcoal-800 hover:bg-rose-500/10 hover:border-rose-500/30 border border-charcoal-700 text-rose-400 text-xs font-medium flex items-center gap-1.5 transition"
                    >
                      <UserX className="w-3.5 h-3.5" />
                      <span>Disconnect</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
