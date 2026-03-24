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

export interface Filters {
  state:    string;
  district: string;
  statuses: PincodeRowStatus[];
}

interface ComingPincodeState {
  pincodes:  PincodeRow[];
  total:     number;
  page:      number;
  limit:     number;
  loading:   boolean;
  error:     string | null;
  counts:    PincodeCounts;
  filters:   Filters;
  states:    string[];
  districts: string[];

  // Pass state/district directly to avoid any store-read timing issues
  fetchPincodes:  (page: number, state: string, district?: string, statuses?: PincodeRowStatus[]) => Promise<void>;
  fetchStates:    () => Promise<void>;
  fetchDistricts: (state: string) => Promise<void>;
  setFilters:     (f: Partial<Filters>) => void;
  clearFilters:   () => void;
}

const DEFAULT_FILTERS: Filters = { state: '', district: '', statuses: [] };
const EMPTY_COUNTS: PincodeCounts = { running: 0, completed: 0, stop: 0, pending: 0 };

export const useComingPincodeStore = create<ComingPincodeState>((set, get) => ({
  pincodes:  [],
  total:     0,
  page:      1,
  limit:     50,
  loading:   false,
  error:     null,
  counts:    { ...EMPTY_COUNTS },
  filters:   { ...DEFAULT_FILTERS },
  states:    [],
  districts: [],

  fetchPincodes: async (page, state, district, statuses) => {
    set({ loading: true, error: null });
    try {
      const { limit } = get();
      const params: Record<string, string> = {
        page:  String(page),
        limit: String(limit),
      };
      if (state)                   params.state        = state;
      if (district)                params.district     = district;
      if (statuses && statuses.length > 0) params.statusFilter = statuses.join(',');

      const { data } = await api.get('/api/admin/pincodes/coming-status', { params });
      set({
        pincodes: data.pincodes  ?? [],
        total:    data.total     ?? 0,
        page:     data.page      ?? page,
        counts:   data.counts    ?? { ...EMPTY_COUNTS },
        loading:  false,
        error:    null,
      });
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Failed to load pincodes';
      console.error('[useComingPincodeStore] fetchPincodes error:', err);
      set({ loading: false, error: msg });
    }
  },

  fetchStates: async () => {
    try {
      const { data } = await api.get('/api/admin/pincodes/filters');
      set({ states: data.states || [] });
    } catch (err) {
      console.error('[useComingPincodeStore] fetchStates error:', err);
    }
  },

  fetchDistricts: async (state: string) => {
    try {
      const params = state ? { state } : {};
      const { data } = await api.get('/api/admin/pincodes/filters', { params });
      set({ districts: data.districts || [] });
    } catch (err) {
      console.error('[useComingPincodeStore] fetchDistricts error:', err);
    }
  },

  setFilters: (f) => {
    set(s => ({ filters: { ...s.filters, ...f } }));
  },

  clearFilters: () => {
    set({
      filters:   { ...DEFAULT_FILTERS },
      districts: [],
      pincodes:  [],
      total:     0,
      counts:    { ...EMPTY_COUNTS },
      error:     null,
    });
  },
}));
