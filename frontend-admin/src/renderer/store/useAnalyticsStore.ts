import { create } from 'zustand';
import api from '../lib/api';
import type { AnalyticsData } from '../../shared/types';

interface AnalyticsStore {
  data: AnalyticsData | null;
  loading: boolean;
  fetchAnalytics: () => Promise<void>;
}

export const useAnalyticsStore = create<AnalyticsStore>((set) => ({
  data: null,
  loading: false,

  fetchAnalytics: async () => {
    set({ loading: true });
    try {
      const res = await api.get('/api/admin/analytics');
      set({ data: res.data, loading: false });
    } catch {
      set({ loading: false });
    }
  },
}));
