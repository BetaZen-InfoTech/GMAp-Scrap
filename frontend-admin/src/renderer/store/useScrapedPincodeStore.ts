import { create } from 'zustand';
import api from '../lib/api';
import type { ScrapedPincodeRecord } from '../../shared/types';

interface ScrapedPincodeFilters {
  search?: string;
  state?: string;
  completionStatus?: 'all' | 'running' | 'completed' | 'stop';
}

interface ScrapedPincodeStore {
  pincodes: ScrapedPincodeRecord[];
  total: number;
  page: number;
  limit: number;
  loading: boolean;
  filters: ScrapedPincodeFilters;

  fetchPincodes: (page?: number) => Promise<void>;
  setFilters: (filters: Partial<ScrapedPincodeFilters>) => void;
  clearFilters: () => void;
}

export const useScrapedPincodeStore = create<ScrapedPincodeStore>((set, get) => ({
  pincodes: [],
  total: 0,
  page: 1,
  limit: 50,
  loading: false,
  filters: {},

  fetchPincodes: async (page = 1) => {
    set({ loading: true });
    const { limit, filters } = get();
    try {
      const params: Record<string, unknown> = { page, limit };
      if (filters.search) params.search = filters.search;
      if (filters.state) params.state = filters.state;
      if (filters.completionStatus && filters.completionStatus !== 'all')
        params.completionStatus = filters.completionStatus;

      const res = await api.get('/api/admin/scraped-pincodes', { params });
      set({ pincodes: res.data.data, total: res.data.total, page, loading: false });
    } catch {
      set({ pincodes: [], total: 0, loading: false });
    }
  },

  setFilters: (filters) => set((s) => ({ filters: { ...s.filters, ...filters } })),
  clearFilters: () => set({ filters: {} }),
}));
