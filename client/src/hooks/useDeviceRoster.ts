import { useEffect, useState, useCallback } from 'react';
import { DeviceInfo, DeviceAudioOutput } from '@echocast/shared';
import { wsClient } from '../core/network/wsClient';

export function useDeviceRoster() {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);

  useEffect(() => {
    // Listen for device list broadcasts from server
    const unsubscribe = wsClient.on<DeviceInfo[]>('DEVICE_LIST', (list) => {
      setDevices(list || []);
    });

    return unsubscribe;
  }, []);

  const receivers = devices.filter((d) => d.role === 'receiver');
  const sender = devices.find((d) => d.role === 'sender');

  const setRemoteReceiverVolume = useCallback((targetDeviceId: string, volume: number) => {
    wsClient.send({
      type: 'REMOTE_SET_RECEIVER_VOLUME',
      payload: { targetDeviceId, volume },
      timestamp: Date.now(),
    });
  }, []);

  const muteRemoteReceiver = useCallback((targetDeviceId: string, isMuted: boolean) => {
    wsClient.send({
      type: 'REMOTE_MUTE_RECEIVER',
      payload: { targetDeviceId, isMuted },
      timestamp: Date.now(),
    });
  }, []);

  const updateRemoteReceiver = useCallback(
    (targetDeviceId: string, updates: { name?: string; outputType?: DeviceAudioOutput }) => {
      wsClient.send({
        type: 'REMOTE_UPDATE_RECEIVER',
        payload: { targetDeviceId, ...updates },
        timestamp: Date.now(),
      });
    },
    []
  );

  const disconnectRemoteReceiver = useCallback((targetDeviceId: string, reason?: string) => {
    wsClient.send({
      type: 'REMOTE_DISCONNECT_RECEIVER',
      payload: { targetDeviceId, reason },
      timestamp: Date.now(),
    });
  }, []);

  const setGroupVolume = useCallback((volume: number) => {
    wsClient.send({
      type: 'GROUP_VOLUME_ALL',
      payload: { volume },
      timestamp: Date.now(),
    });
  }, []);

  const setGroupMute = useCallback((isMuted: boolean) => {
    wsClient.send({
      type: 'GROUP_MUTE_ALL',
      payload: { isMuted },
      timestamp: Date.now(),
    });
  }, []);

  return {
    devices,
    receivers,
    sender,
    setRemoteReceiverVolume,
    muteRemoteReceiver,
    updateRemoteReceiver,
    disconnectRemoteReceiver,
    setGroupVolume,
    setGroupMute,
  };
}
