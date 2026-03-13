import { create } from 'zustand';
import type { LiveStatEvent } from '../../shared/types';

interface LiveStatsStore {
  liveStats: Map<string, LiveStatEvent>;
  updateStat: (event: LiveStatEvent) => void;
  clearAll: () => void;
}

export const useLiveStatsStore = create<LiveStatsStore>((set) => ({
  liveStats: new Map(),

  updateStat: (event) =>
    set((s) => {
      const map = new Map(s.liveStats);
      map.set(event.deviceId, event);
      return { liveStats: map };
    }),

  clearAll: () => set({ liveStats: new Map() }),
}));
