import { create } from 'zustand';
import api from '../lib/api';
import type { PinCodeRecord, PinCodeInput } from '../../shared/types';

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

  createPincode: (input: PinCodeInput) => Promise<PinCodeRecord>;
  updatePincode: (id: string, input: PinCodeInput) => Promise<PinCodeRecord>;
  deletePincode: (id: string) => Promise<void>;
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
  clearFilters: () => set({ filters: {}, page: 1 }),

  createPincode: async (input) => {
    const res = await api.post('/api/admin/pincodes', input);
    // Re-fetch so the new row lands in its correctly-sorted position.
    await get().fetchPincodes(get().page);
    return res.data.data as PinCodeRecord;
  },

  updatePincode: async (id, input) => {
    const res = await api.patch(`/api/admin/pincodes/${id}`, input);
    const updated = res.data.data as PinCodeRecord;
    set((s) => ({
      pincodes: s.pincodes.map((p) => (p._id === id ? { ...p, ...updated } : p)),
    }));
    return updated;
  },

  deletePincode: async (id) => {
    await api.delete(`/api/admin/pincodes/${id}`);
    set((s) => ({
      pincodes: s.pincodes.filter((p) => p._id !== id),
      total: Math.max(0, s.total - 1),
    }));
  },
}));
