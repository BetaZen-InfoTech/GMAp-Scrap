import { create } from 'zustand';
import api from '../lib/api';
import type { ScrapeJob } from '../../shared/types';

interface JobFilters {
  deviceId?: string;
  status?: string;
}

interface StatusCounts {
  running: number;
  paused: number;
  completed: number;
  stopped: number;
  stop: number;
}

interface JobsStore {
  jobs: ScrapeJob[];
  total: number;
  page: number;
  limit: number;
  loading: boolean;
  filters: JobFilters;
  statusCounts: StatusCounts;

  fetchJobs: (page?: number) => Promise<void>;
  setFilters: (f: Partial<JobFilters>) => void;
  clearFilters: () => void;
}

export const useJobsStore = create<JobsStore>((set, get) => ({
  jobs: [],
  total: 0,
  page: 1,
  limit: 50,
  loading: false,
  filters: {},
  statusCounts: { running: 0, paused: 0, completed: 0, stopped: 0, stop: 0 },

  fetchJobs: async (page = 1) => {
    set({ loading: true });
    const { limit, filters } = get();
    try {
      const params: Record<string, string | number> = { page, limit };
      if (filters.deviceId) params.deviceId = filters.deviceId;
      if (filters.status) params.status = filters.status;
      const res = await api.get('/api/admin/jobs', { params });
      set({
        jobs: res.data.data,
        total: res.data.total,
        page,
        loading: false,
        statusCounts: res.data.statusCounts || { running: 0, paused: 0, completed: 0, stopped: 0 },
      });
    } catch {
      set({ loading: false });
    }
  },

  setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),
  clearFilters: () => set({ filters: {} }),
}));
