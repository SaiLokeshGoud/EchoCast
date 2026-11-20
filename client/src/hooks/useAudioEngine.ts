import { useEffect, useState, useCallback } from 'react';
import { AudioTrackMetadata, DeviceAudioOutput, RadioDiagnosticsInfo } from '@echocast/shared';
import { webAudioEngine, AudioEngineState } from '../core/audio/webAudioEngine';

export function useAudioEngine() {
  const [engineState, setEngineState] = useState<AudioEngineState>(webAudioEngine.getState());
  const [currentTrack, setCurrentTrack] = useState<AudioTrackMetadata | null>(webAudioEngine.getCurrentTrack());
  const [volume, setVolumeState] = useState<number>(webAudioEngine.getVolume());
  const [isMuted, setIsMutedState] = useState<boolean>(webAudioEngine.getIsMuted());
  const [outputType, setOutputTypeState] = useState<DeviceAudioOutput>(webAudioEngine.getOutputType());
  const [manualOffsetMs, setManualOffsetMsState] = useState<number>(webAudioEngine.getManualOffsetMs());
  const [positionSec, setPositionSec] = useState<number>(0);
  const [durationSec, setDurationSec] = useState<number>(0);
  const [isUnlocked, setIsUnlocked] = useState<boolean>(webAudioEngine.isUnlocked());
  const [bufferProgress, setBufferProgress] = useState<number>(webAudioEngine.getBufferProgress());
  const [cacheCount, setCacheCount] = useState<number>(webAudioEngine.getCacheCount());
  const [maxCacheEntries, setMaxCacheEntriesState] = useState<number>(webAudioEngine.getMaxCacheEntries());
  const [lastErrorMessage, setLastErrorMessage] = useState<string | null>(webAudioEngine.getLastErrorMessage());
  const [syncErrorMs, setSyncErrorMs] = useState<number>(webAudioEngine.getCurrentSyncErrorMs());
  const [driftCorrectionInfo, setDriftCorrectionInfo] = useState<{ active: boolean; rate: number }>(
    webAudioEngine.getDriftCorrectionInfo()
  );
  const [radioDiagnostics, setRadioDiagnostics] = useState<RadioDiagnosticsInfo>(
    webAudioEngine.getRadioDiagnostics()
  );

  useEffect(() => {
    const unsubscribe = webAudioEngine.subscribe(() => {
      setEngineState(webAudioEngine.getState());
      setCurrentTrack(webAudioEngine.getCurrentTrack());
      setVolumeState(webAudioEngine.getVolume());
      setIsMutedState(webAudioEngine.getIsMuted());
      setOutputTypeState(webAudioEngine.getOutputType());
      setManualOffsetMsState(webAudioEngine.getManualOffsetMs());
      setDurationSec(webAudioEngine.getDuration());
      setIsUnlocked(webAudioEngine.isUnlocked());
      setBufferProgress(webAudioEngine.getBufferProgress());
      setCacheCount(webAudioEngine.getCacheCount());
      setMaxCacheEntriesState(webAudioEngine.getMaxCacheEntries());
      setLastErrorMessage(webAudioEngine.getLastErrorMessage());
      setSyncErrorMs(webAudioEngine.getCurrentSyncErrorMs());
      setDriftCorrectionInfo(webAudioEngine.getDriftCorrectionInfo());
      setRadioDiagnostics(webAudioEngine.getRadioDiagnostics());
    });

    // Position update interval when playing
    const posTimer = setInterval(() => {
      setPositionSec(webAudioEngine.getCurrentPosition());
      setSyncErrorMs(webAudioEngine.getCurrentSyncErrorMs());
      setDriftCorrectionInfo(webAudioEngine.getDriftCorrectionInfo());
      setRadioDiagnostics(webAudioEngine.getRadioDiagnostics());
    }, 100);

    return () => {
      unsubscribe();
      clearInterval(posTimer);
    };
  }, []);

  const unlockAudio = useCallback(async () => {
    return await webAudioEngine.unlock();
  }, []);

  const setVolume = useCallback((v: number) => {
    webAudioEngine.setVolume(v);
  }, []);

  const setMuted = useCallback((m: boolean) => {
    webAudioEngine.setMuted(m);
  }, []);

  const setOutputType = useCallback((type: DeviceAudioOutput) => {
    webAudioEngine.setOutputType(type);
  }, []);

  const setManualOffset = useCallback((ms: number) => {
    webAudioEngine.setManualOffsetMs(ms);
  }, []);

  const clearCache = useCallback(() => {
    webAudioEngine.clearCache();
  }, []);

  const setMaxCacheEntries = useCallback((max: number) => {
    webAudioEngine.setMaxCacheEntries(max);
  }, []);

  const clearError = useCallback(() => {
    webAudioEngine.clearError();
  }, []);

  return {
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
    maxCacheEntries,
    lastErrorMessage,
    syncErrorMs,
    driftCorrectionInfo,
    radioDiagnostics,
    isUnlocked,
    unlockAudio,
    setVolume,
    setMuted,
    setOutputType,
    setManualOffset,
    clearCache,
    setMaxCacheEntries,
    clearError,
    webAudioEngine,
  };
}
