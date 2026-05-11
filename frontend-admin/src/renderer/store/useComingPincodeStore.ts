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

export interface SampleRow extends PincodeRow {
  pageNumber:  number;
  sourceIndex: number;
}

export interface SampleResult {
  samples:     SampleRow[];
  step:        number;
  total:       number;
  sourceCount: number;
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
  setLimit:       (limit: number) => void;
  setFilters:     (f: Partial<Filters>) => void;
  clearFilters:   () => void;

  /**
   * Download an Excel file containing the first row of every page (i.e. every
   * `step`-th pincode). The sheet name embeds the step so the operator can
   * tell the sampling rate at a glance. Uses the same filters as the page.
   */
  downloadSampleExcel: (step: number) => Promise<{ samples: number; sourceCount: number }>;
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

  setLimit: (limit) => {
    set({ limit });
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

  downloadSampleExcel: async (step) => {
    const { filters } = get();
    const params: Record<string, string> = { step: String(step) };
    if (filters.state)              params.state        = filters.state;
    if (filters.district)           params.district     = filters.district;
    if (filters.statuses.length)    params.statusFilter = filters.statuses.join(',');

    const { data } = await api.get<SampleResult>('/api/admin/pincodes/coming-status/sample', { params });
    const samples = data.samples || [];
    if (samples.length === 0) {
      throw new Error('No pincodes match the current filters — nothing to download.');
    }

    const XLSX = await import('xlsx');
    const rows = samples.map((s) => ({
      'Page #':       s.pageNumber,
      'Source Index': s.sourceIndex,
      'Pincode':      s.pincode,
      'District':     s.district || '',
      'State':        s.stateName || '',
      'Status':       s.status,
      'Completed Rounds':   (s.completedRounds || []).join(','),
      'Completed Searches': s.completedSearches,
      'Total Niches':       s.totalNiches,
      'Last Activity': s.lastActivity || '',
      'Last Run At':   s.lastRunAt || '',
      'Updated At':    s.updatedAt || '',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    // Sheet name = "Every <step> (<n> rows)" — encodes the sampling rate.
    // Excel sheet names cap at 31 chars and disallow []:*?/\.
    const sheetName = `Every ${step} (${samples.length} rows)`.slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    XLSX.writeFile(wb, `coming-pincodes-sample-step${step}-${ts}.xlsx`);

    return { samples: samples.length, sourceCount: data.sourceCount };
  },
}));
