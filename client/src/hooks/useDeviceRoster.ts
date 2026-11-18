import { useEffect, useState, useCallback } from 'react';
import { DeviceInfo } from '@echocast/shared';
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

  return {
    devices,
    receivers,
    sender,
    setRemoteReceiverVolume,
    muteRemoteReceiver,
  };
}
