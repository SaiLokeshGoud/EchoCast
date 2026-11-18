import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  DeviceRole,
  DevicePlatform,
  AudioTrackMetadata,
  BroadcastState,
  PlayCommandPayload,
  PauseCommandPayload,
  SeekCommandPayload,
} from '@echocast/shared';
import { Header } from './components/common/Header';
import { QrCodeModal } from './components/common/QrCodeModal';
import { AudioUnlockModal } from './components/common/AudioUnlockModal';
import { SenderDashboard } from './components/sender/SenderDashboard';
import { ReceiverDashboard } from './components/receiver/ReceiverDashboard';
import { wsClient, WsConnectionStatus } from './core/network/wsClient';
import { useClockSync } from './hooks/useClockSync';
import { useAudioEngine } from './hooks/useAudioEngine';
import { useDeviceRoster } from './hooks/useDeviceRoster';
import { useServerStatus } from './hooks/useServerStatus';

function detectPlatform(): DevicePlatform {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'macos';
  if (/Windows NT/i.test(ua)) return 'windows';
  if (/Linux/i.test(ua)) return 'linux';
  return 'other';
}

function generateDefaultDeviceName(platform: DevicePlatform, _role: DeviceRole): string {
  const platformNames: Record<DevicePlatform, string> = {
    android: 'Android Device',
    ios: 'Apple Device',
    windows: 'Windows PC',
    macos: 'Mac Computer',
    linux: 'Linux Device',
    other: 'Receiver Node',
  };
  const base = platformNames[platform] || 'Device';
  const randomSuffix = Math.floor(100 + Math.random() * 900);
  return `${base}-${randomSuffix}`;
}

export function App() {
  // Query param allows starting directly in sender mode, e.g. ?role=sender
  const initialRole: DeviceRole = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get('role') as DeviceRole) || 'sender';
  }, []);

  const [role, setRole] = useState<DeviceRole>(initialRole);
  const [connectionStatus, setConnectionStatus] = useState<WsConnectionStatus>('disconnected');
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [tracks, setTracks] = useState<AudioTrackMetadata[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);

  const platform = useMemo(() => detectPlatform(), []);
  const deviceName = useMemo(() => generateDefaultDeviceName(platform, role), [platform, role]);

  const { metrics: syncMetrics, forceSync, setManualAdjustment } = useClockSync();
  const {
    engineState,
    currentTrack,
    volume,
    isMuted,
    outputType,
    manualOffsetMs,
    positionSec,
    durationSec,
    isUnlocked,
    unlockAudio,
    setVolume,
    setMuted,
    setOutputType,
    setManualOffset,
    webAudioEngine,
  } = useAudioEngine();

  const { receivers, setRemoteReceiverVolume, muteRemoteReceiver } = useDeviceRoster();
  const { status: serverStatus } = useServerStatus();

  // Fetch audio tracks from server
  const fetchTracks = useCallback(async () => {
    try {
      const res = await fetch('/api/audio/tracks');
      if (res.ok) {
        const data: AudioTrackMetadata[] = await res.json();
        setTracks(data);
      }
    } catch (e) {
      console.error('Failed to fetch tracks:', e);
    }
  }, []);

  useEffect(() => {
    fetchTracks();
  }, [fetchTracks]);

  // Connect WebSocket and setup message handlers
  useEffect(() => {
    const unbindStatus = wsClient.onStatusChange((s) => {
      setConnectionStatus(s);
      if (s === 'connected') {
        // Register this device with the server
        wsClient.register({
          name: deviceName,
          role,
          platform,
          outputType,
          userAgent: navigator.userAgent,
        });
      }
    });

    wsClient.connect();

    // Listen to initial broadcast state
    const unbindBroadcastState = wsClient.on<BroadcastState>('BROADCAST_STATE', (state) => {
      setIsPlaying(state.isPlaying);
      if (state.currentTrack) {
        webAudioEngine.loadTrack(state.currentTrack);
      }
      if (state.isPlaying && state.scheduledStartTime) {
        webAudioEngine.schedulePlay(state.scheduledStartTime, state.positionSec, state.generation);
      }
    });

    // Listen to track updates
    const unbindTrack = wsClient.on<AudioTrackMetadata | null>('BROADCAST_TRACK_UPDATE', (track) => {
      if (track) {
        webAudioEngine.loadTrack(track);
        fetchTracks();
      }
    });

    // Listen to scheduled play
    const unbindPlay = wsClient.on<PlayCommandPayload>('BROADCAST_PLAY', (payload) => {
      setIsPlaying(true);
      webAudioEngine.schedulePlay(payload.scheduledServerTime, payload.startPositionSec, payload.generation);
    });

    // Listen to pause
    const unbindPause = wsClient.on<PauseCommandPayload>('BROADCAST_PAUSE', (payload) => {
      setIsPlaying(false);
      webAudioEngine.schedulePause(payload.scheduledServerTime, payload.pausePositionSec, payload.generation);
    });

    // Listen to seek
    const unbindSeek = wsClient.on<SeekCommandPayload>('BROADCAST_SEEK', (payload) => {
      webAudioEngine.scheduleSeek(payload.scheduledServerTime, payload.targetPositionSec, payload.generation);
    });

    // Listen to stop
    const unbindStop = wsClient.on('BROADCAST_STOP', () => {
      setIsPlaying(false);
      webAudioEngine.stop();
    });

    // Listen to test pulse
    const unbindPulse = wsClient.on<{ scheduledServerTime: number; frequencyHz: number; durationMs: number }>(
      'TEST_PULSE_PLAY',
      (payload) => {
        webAudioEngine.playTestPulse(payload.scheduledServerTime, payload.frequencyHz, payload.durationMs);
      }
    );

    // Remote volume control
    const unbindRemoteVol = wsClient.on<{ volume: number }>('REMOTE_SET_RECEIVER_VOLUME', (payload) => {
      setVolume(payload.volume);
    });

    const unbindRemoteMute = wsClient.on<{ isMuted: boolean }>('REMOTE_MUTE_RECEIVER', (payload) => {
      setMuted(payload.isMuted);
    });

    return () => {
      unbindStatus();
      unbindBroadcastState();
      unbindTrack();
      unbindPlay();
      unbindPause();
      unbindSeek();
      unbindStop();
      unbindPulse();
      unbindRemoteVol();
      unbindRemoteMute();
    };
  }, [deviceName, role, platform, outputType, fetchTracks, webAudioEngine, setVolume, setMuted]);

  // Periodic heartbeat reporting local metrics to server
  useEffect(() => {
    if (connectionStatus !== 'connected') return;

    const interval = setInterval(() => {
      wsClient.updateDeviceState({
        roundTripTimeMs: syncMetrics.roundTripTimeMs,
        clockOffsetMs: syncMetrics.clockOffsetMs,
        manualAdjustmentMs: manualOffsetMs,
        volume,
        isMuted,
        outputType,
        audioBufferReady: engineState === 'ready' || engineState === 'playing',
      });
    }, 4000);

    return () => clearInterval(interval);
  }, [connectionStatus, syncMetrics, manualOffsetMs, volume, isMuted, outputType, engineState]);

  // Role change handler
  const handleRoleChange = (newRole: DeviceRole) => {
    setRole(newRole);
    wsClient.register({
      name: deviceName,
      role: newRole,
      platform,
      outputType,
      userAgent: navigator.userAgent,
    });
  };

  // Sender transport triggers
  const handlePlay = (startPos?: number) => {
    wsClient.send({
      type: 'BROADCAST_PLAY',
      payload: {
        trackId: currentTrack?.id || '',
        scheduledServerTime: 0,
        startPositionSec: startPos !== undefined ? startPos : positionSec,
        generation: 0,
      },
      timestamp: Date.now(),
    });
  };

  const handlePause = () => {
    wsClient.send({
      type: 'BROADCAST_PAUSE',
      payload: {
        scheduledServerTime: 0,
        pausePositionSec: positionSec,
        generation: 0,
      },
      timestamp: Date.now(),
    });
  };

  const handleSeek = (targetPos: number) => {
    wsClient.send({
      type: 'BROADCAST_SEEK',
      payload: {
        trackId: currentTrack?.id || '',
        scheduledServerTime: 0,
        targetPositionSec: targetPos,
        generation: 0,
      },
      timestamp: Date.now(),
    });
  };

  const handleStop = () => {
    wsClient.send({
      type: 'BROADCAST_STOP',
      payload: { generation: 0 },
      timestamp: Date.now(),
    });
  };

  const handleSelectTrack = (trackId: string) => {
    const track = tracks.find((t) => t.id === trackId);
    if (track) {
      wsClient.send({
        type: 'BROADCAST_TRACK_UPDATE',
        payload: track,
        timestamp: Date.now(),
      });
    }
  };

  const handleLocalTestPulse = () => {
    webAudioEngine.playTestPulse(0, 1000, 60);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-brand-500 selection:text-white">
      {/* Persistent Navigation Bar */}
      <Header
        role={role}
        onRoleChange={handleRoleChange}
        connectionStatus={connectionStatus}
        primaryUrl={serverStatus?.primaryUrl || window.location.origin}
        onOpenQrModal={() => setIsQrModalOpen(true)}
        isAudioUnlocked={isUnlocked}
        onUnlockAudio={unlockAudio}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {role === 'sender' ? (
          <SenderDashboard
            currentTrack={currentTrack}
            tracks={tracks}
            isPlaying={isPlaying}
            positionSec={positionSec}
            durationSec={durationSec}
            volume={volume}
            isMuted={isMuted}
            receivers={receivers}
            onPlay={handlePlay}
            onPause={handlePause}
            onSeek={handleSeek}
            onStop={handleStop}
            onVolumeChange={setVolume}
            onMuteToggle={() => setMuted(!isMuted)}
            onSelectTrack={handleSelectTrack}
            onRefreshTracks={fetchTracks}
            onRemoteVolume={setRemoteReceiverVolume}
            onRemoteMute={muteRemoteReceiver}
          />
        ) : (
          <ReceiverDashboard
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            engineState={engineState}
            positionSec={positionSec}
            durationSec={durationSec}
            volume={volume}
            isMuted={isMuted}
            outputType={outputType}
            manualOffsetMs={manualOffsetMs}
            syncMetrics={syncMetrics}
            isAudioUnlocked={isUnlocked}
            onUnlockAudio={unlockAudio}
            onVolumeChange={setVolume}
            onMuteToggle={() => setMuted(!isMuted)}
            onOutputTypeChange={setOutputType}
            onManualOffsetChange={(ms) => {
              setManualOffset(ms);
              setManualAdjustment(ms);
            }}
            onForceSync={forceSync}
            onPlayLocalTestPulse={handleLocalTestPulse}
          />
        )}
      </main>

      {/* QR Code Modal */}
      <QrCodeModal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        interfaces={serverStatus?.activeInterfaces || []}
        primaryUrl={serverStatus?.primaryUrl || window.location.origin}
      />

      {/* Floating Audio Unlock Banner on mobile */}
      <AudioUnlockModal isUnlocked={isUnlocked} onUnlock={unlockAudio} />

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 text-center text-xs text-slate-500 font-mono">
        EchoCast • Zero-Cloud Local Synchronized Audio Streaming • Wi-Fi / Hotspot Engine
      </footer>
    </div>
  );
}
export default App;
