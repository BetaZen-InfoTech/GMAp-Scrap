import { create } from 'zustand';
import api from '../lib/api';
import type { PinCodeRecord } from '../../shared/types';

interface PincodeFilters {
  search?: string;
  state?: string[];
  district?: string[];
}

interface PincodeStore {
  pincodes: PinCodeRecord[];
  total: number;
  page: number;
  limit: number;
  loading: boolean;
  filters: PincodeFilters;
  filterOptions: { states: string[]; districts: string[] };

  fetchPincodes: (page?: number) => Promise<void>;
  fetchFilterOptions: (states?: string[]) => Promise<void>;
  setLimit: (limit: number) => void;
  setFilters: (filters: Partial<PincodeFilters>) => void;
  clearFilters: () => void;
}

export const usePincodeStore = create<PincodeStore>((set, get) => ({
  pincodes: [],
  total: 0,
  page: 1,
  limit: 50,
  loading: false,
  filters: {},
  filterOptions: { states: [], districts: [] },

  fetchPincodes: async (page = 1) => {
    set({ loading: true });
    const { limit, filters } = get();
    try {
      const params: Record<string, unknown> = { page, limit };
      if (filters.search) params.search = filters.search;
      if (filters.state?.length) params.state = filters.state.join(',');
      if (filters.district?.length) params.district = filters.district.join(',');

      const res = await api.get('/api/admin/pincodes', { params });
      set({ pincodes: res.data.data, total: res.data.total, page, loading: false });
    } catch {
      set({ pincodes: [], total: 0, loading: false });
    }
  },

  fetchFilterOptions: async (states?: string[]) => {
    try {
      const params: Record<string, string> = {};
      if (states?.length) params.state = states.join(',');
      const res = await api.get('/api/admin/pincodes/filters', { params });
      set({ filterOptions: res.data });
    } catch {
      /* noop */
    }
  },

  setLimit: (limit) => set({ limit }),
  setFilters: (filters) => set((s) => ({ filters: { ...s.filters, ...filters } })),
  clearFilters: () => set({ filters: {} }),
}));
