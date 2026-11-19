import React, { useState } from 'react';
import {
  DeviceInfo,
  DeviceAudioOutput,
  AudioTrackMetadata,
  formatTimeMs,
  evaluateSyncQuality,
  evaluateSyncHealthTag,
  evaluateNetworkQuality,
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
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  Zap,
  Sliders,
  Edit2,
  Check,
  X,
} from 'lucide-react';
import { BluetoothGuideModal } from './BluetoothGuideModal';

interface Props {
  devices: DeviceInfo[];
  sender: DeviceInfo | undefined;
  isPlaying?: boolean;
  currentTrack?: AudioTrackMetadata | null;
  onRemoteVolume: (deviceId: string, vol: number) => void;
  onRemoteMute: (deviceId: string, isMuted: boolean) => void;
  onUpdateReceiver: (deviceId: string, updates: { name?: string; outputType?: DeviceAudioOutput }) => void;
  onDisconnectDevice: (deviceId: string) => void;
  onGroupPlay?: () => void;
  onGroupPause?: () => void;
  onGroupStop?: () => void;
  onGroupSeek?: (targetPos: number) => void;
  onGroupNextTrack?: () => void;
  onGroupPrevTrack?: () => void;
  onGroupVolume?: (volume: number) => void;
  onGroupMute?: (isMuted: boolean) => void;
  onBroadcastTestPulse?: () => void;
  onNavigateToSender?: () => void;
}

export const DeviceManagementScreen: React.FC<Props> = ({
  devices,
  sender,
  isPlaying = false,
  currentTrack,
  onRemoteVolume,
  onRemoteMute,
  onUpdateReceiver,
  onDisconnectDevice,
  onGroupPlay,
  onGroupPause,
  onGroupStop,
  onGroupNextTrack,
  onGroupPrevTrack,
  onGroupVolume,
  onGroupMute,
  onBroadcastTestPulse,
  onNavigateToSender,
}) => {
  const [deviceToDisconnect, setDeviceToDisconnect] = useState<DeviceInfo | null>(null);
  const [isBluetoothGuideOpen, setIsBluetoothGuideOpen] = useState(false);
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [editNameInput, setEditNameInput] = useState('');
  const [groupVolume, setGroupVolumeState] = useState(0.85);
  const [isGroupMuted, setIsGroupMutedState] = useState(false);

  const receivers = devices.filter((d) => d.role === 'receiver');

  // Network & Sync aggregated calculations
  const avgRtt = receivers.length
    ? receivers.reduce((sum, d) => sum + d.roundTripTimeMs, 0) / receivers.length
    : 0;
  const avgJitter = receivers.length
    ? receivers.reduce((sum, d) => sum + (d.jitterMs || 0), 0) / receivers.length
    : 0;

  const receiversWithSync = receivers.filter((d) => d.syncErrorMs !== undefined);
  const avgSyncError = receiversWithSync.length
    ? Math.round(
        receiversWithSync.reduce((sum, d) => sum + Math.abs(d.syncErrorMs || 0), 0) /
          receiversWithSync.length
      )
    : undefined;

  const overallNetwork = evaluateNetworkQuality(avgRtt, avgJitter);

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
      case 'reconnecting':
        return { label: 'Reconnecting...', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' };
      case 'disconnected':
        return { label: 'Offline', color: 'bg-rose-500/10 text-rose-400 border-rose-500/20' };
      default:
        return { label: status, color: 'bg-slate-700/20 text-slate-400 border-slate-700/30' };
    }
  };

  const handleStartRename = (device: DeviceInfo) => {
    setEditingDeviceId(device.id);
    setEditNameInput(device.name);
  };

  const handleSaveRename = (deviceId: string) => {
    if (editNameInput.trim()) {
      onUpdateReceiver(deviceId, { name: editNameInput.trim() });
    }
    setEditingDeviceId(null);
  };

  const handleToggleOutputType = (device: DeviceInfo) => {
    const nextOutput: DeviceAudioOutput = device.outputType === 'bluetooth' ? 'speaker' : 'bluetooth';
    onUpdateReceiver(device.id, { outputType: nextOutput });
  };

  const handleGroupVolumeChange = (newVol: number) => {
    setGroupVolumeState(newVol);
    if (onGroupVolume) onGroupVolume(newVol);
  };

  const handleToggleGroupMute = () => {
    const next = !isGroupMuted;
    setIsGroupMutedState(next);
    if (onGroupMute) onGroupMute(next);
  };

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 space-y-6 animate-in fade-in duration-200">
      {/* Header & Overview Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-charcoal-750">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <Users className="w-6 h-6 text-brand-400" />
            <span>EchoCast Device Management</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Synchronized audio session controller for 5–10 multi-platform receivers (Android, iOS, Windows, Mac).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setIsBluetoothGuideOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-charcoal-850 hover:bg-charcoal-800 border border-charcoal-750 text-xs text-cyanAccent-400 font-semibold transition"
            title="Learn how to connect Bluetooth speakers with zero-echo latency"
          >
            <Headphones className="w-3.5 h-3.5" />
            <span>Bluetooth Setup Guide</span>
          </button>

          <div className="bg-charcoal-900 border border-charcoal-750 rounded-xl px-3.5 py-1.5 text-xs font-mono">
            <span className="text-slate-400">Receivers: </span>
            <span className="text-brand-400 font-bold">{receivers.length}</span>
          </div>

          <div className="bg-charcoal-900 border border-charcoal-750 rounded-xl px-3.5 py-1.5 text-xs font-mono">
            <span className="text-slate-400">Network: </span>
            <span className={`font-bold ${overallNetwork.color}`}>{overallNetwork.label} ({overallNetwork.score}%)</span>
          </div>

          {avgSyncError !== undefined && (
            <div className="bg-charcoal-900 border border-charcoal-750 rounded-xl px-3.5 py-1.5 text-xs font-mono">
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

      {/* Bluetooth Setup Guide Modal */}
      <BluetoothGuideModal
        isOpen={isBluetoothGuideOpen}
        onClose={() => setIsBluetoothGuideOpen(false)}
      />

      {/* Group Controls Control Center Banner */}
      <div className="bg-charcoal-900 border border-charcoal-750/90 rounded-2xl p-4 shadow-lg space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 shrink-0">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">Room Group Transport &amp; Output</h3>
                {isPlaying && (
                  <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400 font-bold bg-emerald-950/40 border border-emerald-800/60 px-2 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    Broadcasting
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 truncate max-w-md">
                {currentTrack ? `Track: "${currentTrack.title}" (${currentTrack.artist})` : 'Select a track on the sender dashboard to stream.'}
              </p>
            </div>
          </div>

          {/* Group Playback Actions */}
          <div className="flex items-center flex-wrap gap-2">
            {onGroupPrevTrack && (
              <button
                onClick={onGroupPrevTrack}
                className="p-2 rounded-xl bg-charcoal-800 hover:bg-charcoal-750 border border-charcoal-700 text-slate-300 hover:text-white transition"
                title="Previous track on all receivers"
              >
                <SkipBack className="w-4 h-4" />
              </button>
            )}

            {isPlaying ? (
              <button
                onClick={onGroupPause}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-charcoal-950 font-bold text-xs shadow-md transition"
                title="Pause playback on all receivers"
              >
                <Pause className="w-4 h-4 fill-current" />
                <span>Pause All</span>
              </button>
            ) : (
              <button
                onClick={onGroupPlay}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-500 hover:bg-brand-400 text-charcoal-950 font-bold text-xs shadow-md transition"
                title="Play on all receivers simultaneously"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Play All</span>
              </button>
            )}

            {onGroupNextTrack && (
              <button
                onClick={onGroupNextTrack}
                className="p-2 rounded-xl bg-charcoal-800 hover:bg-charcoal-750 border border-charcoal-700 text-slate-300 hover:text-white transition"
                title="Next track on all receivers"
              >
                <SkipForward className="w-4 h-4" />
              </button>
            )}

            {onGroupStop && (
              <button
                onClick={onGroupStop}
                className="p-2 rounded-xl bg-charcoal-800 hover:bg-charcoal-750 border border-charcoal-700 text-slate-400 hover:text-rose-400 transition"
                title="Stop playback on all receivers"
              >
                <Square className="w-4 h-4" />
              </button>
            )}

            {onBroadcastTestPulse && (
              <button
                onClick={onBroadcastTestPulse}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-charcoal-800 hover:bg-charcoal-750 border border-charcoal-700 text-amber-300 text-xs font-semibold transition"
                title="Broadcast 1kHz alignment pulse across all connected receiver speakers"
              >
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Sync Pulse</span>
              </button>
            )}
          </div>
        </div>

        {/* Master Receiver Volume & Mute All Controls */}
        <div className="pt-2 border-t border-charcoal-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3 flex-1 max-w-md">
            <button
              onClick={handleToggleGroupMute}
              className={`p-1.5 rounded-lg border transition ${
                isGroupMuted
                  ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                  : 'bg-charcoal-800 border-charcoal-700 text-slate-300 hover:text-white'
              }`}
              title={isGroupMuted ? 'Unmute all receivers' : 'Mute all receivers'}
            >
              {isGroupMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-brand-400" />}
            </button>
            <span className="text-slate-400 font-mono shrink-0">Master Receivers Vol:</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={isGroupMuted ? 0 : groupVolume}
              onChange={(e) => handleGroupVolumeChange(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-charcoal-750 rounded-lg appearance-none cursor-pointer accent-brand-500"
            />
            <span className="font-mono font-bold text-white min-w-[36px] text-right">
              {Math.round((isGroupMuted ? 0 : groupVolume) * 100)}%
            </span>
          </div>

          <div className="text-[11px] text-slate-400 font-mono">
            <span>{receivers.length} active endpoint{receivers.length === 1 ? '' : 's'} connected</span>
          </div>
        </div>
      </div>

      {/* Sender Node Card if present */}
      {sender && (
        <div className="bg-charcoal-900 border border-brand-500/30 rounded-2xl p-4 shadow-md space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-brand-500/15 border border-brand-500/30 flex items-center justify-center text-brand-400">
                <Radio className="w-4 h-4 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white">{sender.name}</h3>
                  <span className="text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded bg-brand-500/20 text-brand-300">
                    Host Sender
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-mono">
                  IP: {sender.ipAddress || 'Host Machine'} • Platform: {sender.platform} • Room: {sender.roomId || 'ECHO-CAST'}
                </p>
              </div>
            </div>

            {onNavigateToSender && (
              <button
                onClick={onNavigateToSender}
                className="px-3 py-1.5 rounded-xl bg-charcoal-800 hover:bg-charcoal-750 text-slate-300 text-xs font-medium border border-charcoal-700 transition"
              >
                Go to Sender Dashboard
              </button>
            )}
          </div>
        </div>
      )}

      {/* Receivers Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <span>Connected Receivers ({receivers.length})</span>
          </h3>
          <span className="text-xs text-slate-400 font-mono">
            Max capacity: 10 concurrent streams
          </span>
        </div>

        {receivers.length === 0 ? (
          <div className="bg-charcoal-900 border border-charcoal-750 rounded-2xl p-12 text-center space-y-3">
            <Smartphone className="w-12 h-12 text-slate-600 mx-auto" />
            <h4 className="text-base font-bold text-slate-200">No Receiver Devices Connected</h4>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Devices that scan your QR code or open your room link will automatically appear here with real-time latency statistics and volume controls.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {receivers.map((device) => {
              const PlatformIcon = getPlatformIcon(device.platform);
              const statusBadge = getStatusBadge(device.status);
              const syncQuality = evaluateSyncQuality(device.clockOffsetMs, device.roundTripTimeMs);
              const syncHealth = evaluateSyncHealthTag(device.syncErrorMs);
              const networkHealth = evaluateNetworkQuality(device.roundTripTimeMs, device.jitterMs);
              const isEditing = editingDeviceId === device.id;

              return (
                <div
                  key={device.id}
                  className="bg-charcoal-900 border border-charcoal-750 hover:border-charcoal-700 rounded-2xl p-4 shadow-md space-y-3 transition flex flex-col justify-between"
                >
                  {/* Top: Name & Badges */}
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="w-9 h-9 rounded-xl bg-charcoal-850 border border-charcoal-750 flex items-center justify-center text-slate-300 shrink-0">
                          <PlatformIcon className="w-4 h-4 text-cyanAccent-400" />
                        </div>

                        {/* Device Name with Inline Editing */}
                        <div className="min-w-0 flex-1">
                          {isEditing ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={editNameInput}
                                onChange={(e) => setEditNameInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveRename(device.id);
                                  if (e.key === 'Escape') setEditingDeviceId(null);
                                }}
                                className="w-full bg-charcoal-800 border border-brand-500 rounded px-2 py-0.5 text-xs text-white focus:outline-none"
                                autoFocus
                              />
                              <button
                                onClick={() => handleSaveRename(device.id)}
                                className="p-1 text-emerald-400 hover:bg-charcoal-750 rounded"
                                title="Save Name"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setEditingDeviceId(null)}
                                className="p-1 text-slate-400 hover:bg-charcoal-750 rounded"
                                title="Cancel"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 group">
                              <h4 className="text-sm font-bold text-white truncate">{device.name}</h4>
                              <button
                                onClick={() => handleStartRename(device)}
                                className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-white transition"
                                title="Rename device"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}

                          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono mt-0.5">
                            <span className="capitalize">{device.platform}</span>
                            <span>•</span>
                            <button
                              onClick={() => handleToggleOutputType(device)}
                              className="flex items-center gap-1 text-[11px] text-slate-300 hover:text-cyanAccent-400 transition"
                              title="Click to toggle between Speaker and Bluetooth"
                            >
                              {device.outputType === 'bluetooth' ? (
                                <Headphones className="w-3 h-3 text-cyanAccent-400" />
                              ) : (
                                <Speaker className="w-3 h-3 text-brand-400" />
                              )}
                              <span className="capitalize">{device.outputType}</span>
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Status and Health Badges */}
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${statusBadge.color}`}>
                          {statusBadge.label}
                        </span>
                        {device.syncErrorMs !== undefined ? (
                          <span className={`text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded border ${syncHealth.badgeClass}`}>
                            {syncHealth.label}
                          </span>
                        ) : (
                          <span className="text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded border border-charcoal-700 text-slate-400 capitalize">
                            {syncQuality}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Diagnostics 4-Box Grid */}
                    <div className="grid grid-cols-2 gap-2 p-2.5 bg-charcoal-850 border border-charcoal-750/70 rounded-xl text-xs font-mono">
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
                        <span className="text-[10px] text-slate-500 uppercase block">Network Health</span>
                        <span className={`font-bold ${networkHealth.color}`}>
                          {networkHealth.label} <span className="text-[10px] text-slate-400">({networkHealth.score}%)</span>
                        </span>
                      </div>
                    </div>

                    {/* Volume Control */}
                    <div className="space-y-1 pt-1">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span className="text-[11px] font-medium">Output Volume</span>
                        <span className="font-mono font-bold text-slate-200">
                          {Math.round((device.isMuted ? 0 : device.volume) * 100)}%
                        </span>
                      </div>

                      <div className="flex items-center gap-2.5">
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
                  </div>

                  {/* Bottom Footer Actions */}
                  <div className="pt-2 border-t border-charcoal-750/60 flex items-center justify-between text-xs">
                    <span className="text-[11px] text-slate-500 font-mono">
                      {device.outputType === 'bluetooth' ? 'Bluetooth (+160ms)' : 'Built-in Audio'}
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleOutputType(device)}
                        className="px-2 py-1 rounded-lg bg-charcoal-800 hover:bg-charcoal-750 text-slate-300 text-[11px] transition"
                        title="Switch audio routing profile"
                      >
                        {device.outputType === 'bluetooth' ? 'Switch to Speaker' : 'Switch to BT'}
                      </button>

                      <button
                        onClick={() => setDeviceToDisconnect(device)}
                        className="px-2.5 py-1 rounded-lg bg-charcoal-800 hover:bg-rose-500/10 hover:border-rose-500/30 border border-charcoal-700 text-rose-400 text-xs font-medium flex items-center gap-1 transition"
                        title="Remove receiver from room"
                      >
                        <UserX className="w-3.5 h-3.5" />
                        <span>Disconnect</span>
                      </button>
                    </div>
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
