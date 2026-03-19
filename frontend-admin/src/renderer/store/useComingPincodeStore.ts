import { create } from 'zustand';
import api from '../lib/api';

export type PincodeRowStatus = 'running' | 'completed' | 'stop' | 'pending';

export interface PincodeRow {
  pincode:           number;
  district:          string | null;
  stateName:         string | null;
  status:            PincodeRowStatus;
  completedRounds:   number[];
  completedSearches: number;
  totalNiches:       number;
  lastActivity:      string | null;
  lastRunAt:         string | null;
  updatedAt:         string | null;
}

export interface PincodeCounts {
  running:   number;
  completed: number;
  stop:      number;
  pending:   number;
}

interface Filters {
  state:    string;
  district: string;
  statuses: PincodeRowStatus[]; // empty = all
}

interface ComingPincodeState {
  pincodes:  PincodeRow[];
  total:     number;
  page:      number;
  limit:     number;
  loading:   boolean;
  counts:    PincodeCounts;
  filters:   Filters;
  states:    string[];
  districts: string[];

  fetchPincodes:  (page?: number) => Promise<void>;
  fetchStates:    () => Promise<void>;
  fetchDistricts: (state: string) => Promise<void>;
  setFilters:     (f: Partial<Filters>) => void;
  clearFilters:   () => void;
}

const DEFAULT_FILTERS: Filters = { state: '', district: '', statuses: [] };

export const useComingPincodeStore = create<ComingPincodeState>((set, get) => ({
  pincodes:  [],
  total:     0,
  page:      1,
  limit:     50,
  loading:   false,
  counts:    { running: 0, completed: 0, stop: 0, pending: 0 },
  filters:   { ...DEFAULT_FILTERS },
  states:    [],
  districts: [],

  fetchPincodes: async (page = 1) => {
    set({ loading: true });
    try {
      const { filters, limit } = get();
      const params: Record<string, string> = {
        page:  String(page),
        limit: String(limit),
      };
      if (filters.state)              params.state    = filters.state;
      if (filters.district)           params.district = filters.district;
      if (filters.statuses.length > 0) params.statusFilter = filters.statuses.join(',');

      const { data } = await api.get('/api/pincodes/status', { params });
      set({
        pincodes: data.pincodes,
        total:    data.total,
        page:     data.page,
        counts:   data.counts,
        loading:  false,
      });
    } catch (err) {
      console.error('[useComingPincodeStore] fetchPincodes error:', err);
      set({ loading: false });
    }
  },

  fetchStates: async () => {
    try {
      const { data } = await api.get('/api/pincodes/states');
      set({ states: data });
    } catch (err) {
      console.error('[useComingPincodeStore] fetchStates error:', err);
    }
  },

  fetchDistricts: async (state: string) => {
    try {
      const params = state ? { state } : {};
      const { data } = await api.get('/api/pincodes/districts', { params });
      set({ districts: data });
    } catch (err) {
      console.error('[useComingPincodeStore] fetchDistricts error:', err);
    }
  },

  setFilters: (f) => {
    set(s => ({ filters: { ...s.filters, ...f } }));
  },

  clearFilters: () => {
    set({ filters: { ...DEFAULT_FILTERS }, districts: [] });
  },
}));
