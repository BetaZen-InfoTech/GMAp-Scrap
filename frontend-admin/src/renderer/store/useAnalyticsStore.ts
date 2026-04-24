import { create } from 'zustand';
import api from '../lib/api';
import type { AnalyticsData } from '../../shared/types';

interface AnalyticsStore {
  data: AnalyticsData | null;
  loading: boolean;
  error: string | null;
  fetchAnalytics: () => Promise<void>;
}

export const useAnalyticsStore = create<AnalyticsStore>((set) => ({
  data: null,
  loading: false,
  error: null,

  fetchAnalytics: async () => {
    set({ loading: true });
    try {
      const res = await api.get('/api/admin/analytics');
      set({ data: res.data, loading: false, error: null });
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      const message = e?.response?.data?.error || e?.message || 'Failed to load analytics';
      console.error('[analytics] fetch failed:', message);
      set({ loading: false, error: message });
    }
  },
}));
