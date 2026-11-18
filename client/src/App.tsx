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
import { Header, AppScreen } from './components/common/Header';
import { QrCodeModal } from './components/common/QrCodeModal';
import { AudioUnlockModal } from './components/common/AudioUnlockModal';
import { WelcomeScreen } from './components/welcome/WelcomeScreen';
import { SenderDashboard } from './components/sender/SenderDashboard';
import { ReceiverDashboard } from './components/receiver/ReceiverDashboard';
import { DeviceManagementScreen } from './components/devices/DeviceManagementScreen';
import { SettingsScreen } from './components/settings/SettingsScreen';
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

function generateInitialDeviceName(platform: DevicePlatform): string {
  const platformNames: Record<DevicePlatform, string> = {
    android: 'Android Device',
    ios: 'Apple iPhone',
    windows: 'Windows Laptop',
    macos: 'Mac Computer',
    linux: 'Linux Endpoint',
    other: 'EchoCast Node',
  };
  const base = platformNames[platform] || 'EchoCast Device';
  const randomSuffix = Math.floor(100 + Math.random() * 900);
  return `${base}-${randomSuffix}`;
}

export function App() {
  const searchParams = useMemo(() => new URLSearchParams(window.location.search), []);

  const initialScreen: AppScreen = useMemo(() => {
    const roleParam = searchParams.get('role');
    const roomParam = searchParams.get('room') || searchParams.get('join') || searchParams.get('code');
    if (roomParam) return 'receiver';
    if (roleParam === 'sender') return 'sender';
    if (roleParam === 'receiver') return 'receiver';
    return 'welcome';
  }, [searchParams]);

  const initialRoomId = useMemo(() => {
    return (
      searchParams.get('room') ||
      searchParams.get('join') ||
      searchParams.get('code') ||
      localStorage.getItem('echocast_room_id') ||
      'CAST-842'
    );
  }, [searchParams]);

  const [activeScreen, setActiveScreen] = useState<AppScreen>(initialScreen);
  const [role, setRole] = useState<DeviceRole>(initialScreen === 'sender' ? 'sender' : 'receiver');
  const [roomId, setRoomId] = useState<string>(initialRoomId);
  const [isRoomActive, setIsRoomActive] = useState<boolean>(true);
  const [connectionStatus, setConnectionStatus] = useState<WsConnectionStatus>('disconnected');
  const [roomValidationError, setRoomValidationError] = useState<string | null>(null);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [tracks, setTracks] = useState<AudioTrackMetadata[]>([]);
  const [playlist, setPlaylist] = useState<AudioTrackMetadata[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [autoplay, setAutoplay] = useState(true);
  const [loop, setLoop] = useState(false);

  // Settings State
  const [bufferDelayMs, setBufferDelayMs] = useState<number>(650);
  const [audioSampleRate, setAudioSampleRate] = useState<number>(44100);

  const platform = useMemo(() => detectPlatform(), []);
  const [deviceName, setDeviceName] = useState<string>(() => {
    return localStorage.getItem('echocast_device_name') || generateInitialDeviceName(platform);
  });

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
    bufferProgress,
    cacheCount,
    isUnlocked,
    unlockAudio,
    setVolume,
    setMuted,
    setOutputType,
    setManualOffset,
    webAudioEngine,
  } = useAudioEngine();

  const {
    devices,
    receivers,
    sender,
    setRemoteReceiverVolume,
    muteRemoteReceiver,
    disconnectRemoteReceiver,
  } = useDeviceRoster();

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
          roomId,
        });
      }
    });

    wsClient.connect();

    // Listen to initial broadcast state
    const unbindBroadcastState = wsClient.on<BroadcastState>('BROADCAST_STATE', (state) => {
      setIsPlaying(state.isPlaying);
      if (state.playlist && Array.isArray(state.playlist)) {
        setPlaylist(state.playlist);
      }
      if (state.autoplay !== undefined) {
        setAutoplay(state.autoplay);
      }
      if (state.loop !== undefined) {
        setLoop(state.loop);
      }
      if (state.isRoomActive !== undefined) {
        setIsRoomActive(state.isRoomActive);
      }
      if (state.roomId) {
        setRoomId(state.roomId);
      }
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

    // Remote disconnect notification
    const unbindDisconnect = wsClient.on<{ reason?: string }>('REMOTE_DISCONNECT_RECEIVER', (payload) => {
      alert(`You have been disconnected from the stream: ${payload.reason || 'By Host'}`);
      wsClient.disconnect();
      setActiveScreen('welcome');
    });

    // Server error handler (room authorization / validation)
    const unbindError = wsClient.on<{ code: string; message: string }>('ERROR', (payload) => {
      if (payload.code === 'INVALID_ROOM_ID' || payload.code === 'ROOM_INACTIVE') {
        setRoomValidationError(payload.message);
      }
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
      unbindDisconnect();
      unbindError();
    };
  }, [deviceName, role, platform, outputType, roomId, fetchTracks, webAudioEngine, setVolume, setMuted]);

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
        roomId,
      });
    }, 4000);

    return () => clearInterval(interval);
  }, [connectionStatus, syncMetrics, manualOffsetMs, volume, isMuted, outputType, engineState, roomId]);

  // Screen navigation handler
  const handleNavigate = (screen: AppScreen) => {
    setActiveScreen(screen);
    if (screen === 'sender' && role !== 'sender') {
      setRole('sender');
      wsClient.register({
        name: deviceName,
        role: 'sender',
        platform,
        outputType,
        userAgent: navigator.userAgent,
        roomId,
      });
    } else if (screen === 'receiver' && role !== 'receiver') {
      setRole('receiver');
      wsClient.register({
        name: deviceName,
        role: 'receiver',
        platform,
        outputType,
        userAgent: navigator.userAgent,
        roomId,
      });
    }
  };

  // Room ID update handler
  const handleUpdateRoomId = (newRoomId: string) => {
    setRoomValidationError(null);
    setRoomId(newRoomId);
    localStorage.setItem('echocast_room_id', newRoomId);
    wsClient.register({
      name: deviceName,
      role,
      platform,
      outputType,
      userAgent: navigator.userAgent,
      roomId: newRoomId,
    });
    if (role === 'sender') {
      wsClient.send({
        type: 'BROADCAST_ROOM_UPDATE',
        payload: { isRoomActive, roomId: newRoomId },
        timestamp: Date.now(),
      });
    }
  };

  const handleDisconnectRoom = () => {
    wsClient.send({
      type: 'RECEIVER_LEAVE_ROOM',
      payload: { deviceId: wsClient.getDeviceId() },
      timestamp: Date.now(),
    });
    webAudioEngine.stop();
    setActiveScreen('welcome');
  };

  const handleToggleRoomActive = (active: boolean) => {
    setIsRoomActive(active);
    wsClient.send({
      type: 'BROADCAST_ROOM_UPDATE',
      payload: { isRoomActive: active, roomId },
      timestamp: Date.now(),
    });
  };

  // Device name update handler
  const handleUpdateDeviceName = (newName: string) => {
    setDeviceName(newName);
    localStorage.setItem('echocast_device_name', newName);
    wsClient.register({
      name: newName,
      role,
      platform,
      outputType,
      userAgent: navigator.userAgent,
      roomId,
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

  const handleSelectTrack = useCallback((trackId: string) => {
    const track = tracks.find((t) => t.id === trackId) || playlist.find((t) => t.id === trackId);
    if (track) {
      wsClient.send({
        type: 'BROADCAST_TRACK_UPDATE',
        payload: track,
        timestamp: Date.now(),
      });
    }
  }, [tracks, playlist]);

  // Previous and Next track handlers
  const activePlaylist = useMemo(() => {
    return playlist.length > 0 ? playlist : tracks;
  }, [playlist, tracks]);

  const handlePreviousTrack = useCallback(() => {
    if (activePlaylist.length === 0) return;
    const currentIndex = activePlaylist.findIndex((t) => t.id === currentTrack?.id);
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : activePlaylist.length - 1;
    handleSelectTrack(activePlaylist[prevIndex].id);
    handlePlay(0);
  }, [activePlaylist, currentTrack, handleSelectTrack]);

  const handleNextTrack = useCallback(() => {
    if (activePlaylist.length === 0) return;
    const currentIndex = activePlaylist.findIndex((t) => t.id === currentTrack?.id);
    const nextIndex = currentIndex < activePlaylist.length - 1 ? currentIndex + 1 : 0;
    handleSelectTrack(activePlaylist[nextIndex].id);
    handlePlay(0);
  }, [activePlaylist, currentTrack, handleSelectTrack]);

  // Autoplay handler when current track finishes naturally
  useEffect(() => {
    const unbindEnded = webAudioEngine.onEnded(() => {
      if (role === 'sender' && autoplay) {
        handleNextTrack();
      }
    });
    return unbindEnded;
  }, [role, autoplay, handleNextTrack, webAudioEngine]);

  // Playlist management handlers
  const handleDeleteTrack = async (trackId: string) => {
    try {
      const res = await fetch(`/api/audio/tracks/${trackId}`, { method: 'DELETE' });
      if (res.ok) {
        fetchTracks();
      }
    } catch (e) {
      console.error('Failed to delete track:', e);
    }
  };

  const handleReorderPlaylist = (newPlaylist: AudioTrackMetadata[]) => {
    setPlaylist(newPlaylist);
    wsClient.send({
      type: 'BROADCAST_PLAYLIST_UPDATE',
      payload: { playlist: newPlaylist },
      timestamp: Date.now(),
    });
  };

  const handleToggleAutoplay = (enabled: boolean) => {
    setAutoplay(enabled);
    wsClient.send({
      type: 'BROADCAST_AUTOPLAY_UPDATE',
      payload: { autoplay: enabled },
      timestamp: Date.now(),
    });
  };

  const handleToggleLoop = (enabled: boolean) => {
    setLoop(enabled);
  };

  const handleLocalTestPulse = () => {
    webAudioEngine.playTestPulse(0, 1000, 60);
  };

  return (
    <div className="min-h-screen flex flex-col bg-charcoal-950 text-slate-100 selection:bg-brand-500 selection:text-charcoal-950">
      {/* Top Persistent Header */}
      <Header
        activeScreen={activeScreen}
        onNavigate={handleNavigate}
        connectionStatus={connectionStatus}
        primaryUrl={serverStatus?.primaryUrl || window.location.origin}
        roomId={roomId}
        receiverCount={receivers.length}
        onOpenQrModal={() => setIsQrModalOpen(true)}
        isAudioUnlocked={isUnlocked}
        onUnlockAudio={unlockAudio}
      />

      {/* Main Dynamic Viewport */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeScreen === 'welcome' && (
          <WelcomeScreen
            onStartStreaming={() => handleNavigate('sender')}
            onJoinStream={() => handleNavigate('receiver')}
            serverStatus={serverStatus}
            connectedReceiversCount={receivers.length}
          />
        )}

        {activeScreen === 'sender' && (
          <SenderDashboard
            roomId={roomId}
            onUpdateRoomId={handleUpdateRoomId}
            isRoomActive={isRoomActive}
            onToggleRoomActive={handleToggleRoomActive}
            onOpenQrModal={() => setIsQrModalOpen(true)}
            currentTrack={currentTrack}
            tracks={tracks}
            playlist={playlist}
            isPlaying={isPlaying}
            autoplay={autoplay}
            onToggleAutoplay={handleToggleAutoplay}
            loop={loop}
            onToggleLoop={handleToggleLoop}
            positionSec={positionSec}
            durationSec={durationSec}
            volume={volume}
            isMuted={isMuted}
            receivers={receivers}
            onPlay={handlePlay}
            onPause={handlePause}
            onSeek={handleSeek}
            onStop={handleStop}
            onPreviousTrack={handlePreviousTrack}
            onNextTrack={handleNextTrack}
            onVolumeChange={setVolume}
            onMuteToggle={() => setMuted(!isMuted)}
            onSelectTrack={handleSelectTrack}
            onRefreshTracks={fetchTracks}
            onDeleteTrack={handleDeleteTrack}
            onReorderPlaylist={handleReorderPlaylist}
            onNavigateToDevices={() => handleNavigate('devices')}
            primaryUrl={serverStatus?.primaryUrl || window.location.origin}
            isHotspotDetected={serverStatus?.isHotspotDetected || false}
          />
        )}

        {activeScreen === 'receiver' && (
          <ReceiverDashboard
            currentRoomId={roomId}
            isRoomActive={isRoomActive}
            connectionStatus={connectionStatus}
            roomValidationError={roomValidationError}
            senderInfo={{
              primaryUrl: serverStatus?.primaryUrl || window.location.origin,
              senderConnected: sender !== undefined || serverStatus?.senderConnected || false,
              connectedReceiversCount: receivers.length,
            }}
            onConnectRoom={handleUpdateRoomId}
            onDisconnectRoom={handleDisconnectRoom}
            onOpenQrModal={() => setIsQrModalOpen(true)}
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            engineState={engineState}
            bufferProgress={bufferProgress}
            cacheCount={cacheCount}
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
            onSetAudioSinkId={(sinkId) => webAudioEngine.setAudioSinkId(sinkId)}
          />
        )}

        {activeScreen === 'devices' && (
          <DeviceManagementScreen
            devices={devices}
            sender={sender}
            onRemoteVolume={setRemoteReceiverVolume}
            onRemoteMute={muteRemoteReceiver}
            onDisconnectDevice={disconnectRemoteReceiver}
          />
        )}

        {activeScreen === 'settings' && (
          <SettingsScreen
            currentDeviceName={deviceName}
            onUpdateDeviceName={handleUpdateDeviceName}
            syncMetrics={syncMetrics}
            onForceSync={forceSync}
            serverStatus={serverStatus}
            bufferDelayMs={bufferDelayMs}
            onUpdateBufferDelay={setBufferDelayMs}
            audioSampleRate={audioSampleRate}
            onUpdateSampleRate={setAudioSampleRate}
          />
        )}
      </main>

      {/* Dynamic QR Code Modal */}
      <QrCodeModal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        interfaces={serverStatus?.activeInterfaces || []}
        primaryUrl={serverStatus?.primaryUrl || window.location.origin}
        roomId={roomId}
      />

      {/* Floating Audio Hardware Unlock Banner */}
      <AudioUnlockModal isUnlocked={isUnlocked} onUnlock={unlockAudio} />

      {/* Sleek Minimal Footer */}
      <footer className="border-t border-charcoal-800 bg-charcoal-950 py-4 text-center text-xs text-slate-500 font-mono">
        EchoCast • Zero-Cloud Synchronized Audio Architecture • Inspired by Spotify & Sonos
      </footer>
    </div>
  );
}

export default App;
