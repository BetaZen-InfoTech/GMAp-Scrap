import { useEffect } from 'react';
import { connectSocket, disconnectSocket } from '../lib/socket';
import { useLiveStatsStore } from '../store/useLiveStatsStore';
import { useDeviceStore } from '../store/useDeviceStore';
import type { LiveStatEvent } from '../../shared/types';

export function useSocket(serverUrl: string) {
  const updateStat = useLiveStatsStore((s) => s.updateStat);
  const updateLiveStats = useDeviceStore((s) => s.updateLiveStats);

  useEffect(() => {
    if (!serverUrl) return;

    const socket = connectSocket(serverUrl);

    socket.on('device:stats-live', (event: LiveStatEvent) => {
      updateStat(event);
      updateLiveStats(event.deviceId, event.stat);
    });

    return () => {
      disconnectSocket();
    };
  }, [serverUrl]);
}
