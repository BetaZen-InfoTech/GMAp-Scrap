import Store from 'electron-store';
import { DeviceStats } from '../shared/types';

interface DeviceHistorySchema {
  pendingStats: DeviceStats[];
}

const historyStore = new Store<DeviceHistorySchema>({
  name: 'device-history',
  defaults: {
    pendingStats: [],
  },
});

export function addStatSnapshot(stats: DeviceStats): void {
  const pending = historyStore.get('pendingStats') ?? [];
  pending.push(stats);
  historyStore.set('pendingStats', pending);
}

export function getPendingStats(): DeviceStats[] {
  return historyStore.get('pendingStats') ?? [];
}

export function clearPendingStats(): void {
  historyStore.set('pendingStats', []);
}
