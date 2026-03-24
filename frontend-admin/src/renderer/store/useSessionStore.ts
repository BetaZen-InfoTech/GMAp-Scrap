import { create } from 'zustand';
import api from '../lib/api';
import type { SessionStatsRecord } from '../../shared/types';

interface SessionFilters {
  deviceId?: string;
  status?: string;
  keyword?: string;
  from?: string;
  to?: string;
}

interface SessionStore {
  sessions: SessionStatsRecord[];
  total: number;
  page: number;
  limit: number;
  loading: boolean;
  filters: SessionFilters;

  fetchSessions: (page?: number) => Promise<void>;
  setLimit: (limit: number) => void;
  setFilters: (filters: Partial<SessionFilters>) => void;
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: [],
  total: 0,
  page: 1,
  limit: 25,
  loading: false,
  filters: {},

  fetchSessions: async (page = 1) => {
    set({ loading: true });
    const { limit, filters } = get();
    try {
      const params: Record<string, unknown> = { ...filters, page, limit };
      const res = await api.get('/api/admin/sessions', { params });
      set({ sessions: res.data.data, total: res.data.total, page, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  setLimit: (limit) => set({ limit }),
  setFilters: (filters) => set((s) => ({ filters: { ...s.filters, ...filters } })),
}));
