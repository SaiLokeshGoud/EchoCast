import { useEffect, useState, useCallback } from 'react';
import { AudioTrackMetadata, DeviceAudioOutput } from '@echocast/shared';
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
    });

    // Position update interval when playing
    const posTimer = setInterval(() => {
      setPositionSec(webAudioEngine.getCurrentPosition());
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

  return {
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
  };
}
