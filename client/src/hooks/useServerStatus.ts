import { useEffect, useState, useCallback } from 'react';
import { ServerRuntimeStatus } from '@echocast/shared';

export function useServerStatus() {
  const [status, setStatus] = useState<ServerRuntimeStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/server/status');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ServerRuntimeStatus = await res.json();
      setStatus(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch server status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  return {
    status,
    loading,
    error,
    refetch: fetchStatus,
  };
}
