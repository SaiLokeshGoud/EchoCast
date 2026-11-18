import { useEffect, useState } from 'react';
import { SyncMetrics } from '@echocast/shared';
import { timeSync } from '../core/sync/timeSync';
import { wsClient } from '../core/network/wsClient';

export function useClockSync() {
  const [metrics, setMetrics] = useState<SyncMetrics>(timeSync.getMetrics());

  useEffect(() => {
    return timeSync.subscribe((newMetrics) => {
      setMetrics(newMetrics);
    });
  }, []);

  const forceSync = () => {
    timeSync.reset();
    wsClient.startInitialSyncBurst();
  };

  const setManualAdjustment = (ms: number) => {
    timeSync.setManualAdjustment(ms);
  };

  return {
    metrics,
    forceSync,
    setManualAdjustment,
    timeSync,
  };
}
