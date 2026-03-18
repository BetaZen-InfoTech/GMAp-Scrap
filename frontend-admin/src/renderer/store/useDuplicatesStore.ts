import { create } from 'zustand';
import api from '../lib/api';
import type { ScrapedDataRecord } from '../../shared/types';

export type DuplicatesTab = 'flagged' | 'archive';

interface AnalyzeResult {
  movedCount: number;
  groupCount: number;
  flagsUpdated: number;
}

interface DuplicatesStore {
  // Flagged duplicates (isDuplicate: true in Scraped-Data)
  records: ScrapedDataRecord[];
  total: number;
  page: number;
  limit: number;
  loading: boolean;
  search: string;

  // Archive (Scraped-Data-Duplicate collection)
  archiveRecords: ScrapedDataRecord[];
  archiveTotal: number;
  archivePage: number;
  archiveLoading: boolean;
  archiveSearch: string;

  // Analysis
  analyzing: boolean;
  analyzeResult: AnalyzeResult | null;

  // Active tab
  activeTab: DuplicatesTab;

  fetchRecords: (page?: number) => Promise<void>;
  fetchArchive: (page?: number) => Promise<void>;
  setSearch: (search: string) => void;
  setArchiveSearch: (search: string) => void;
  setLimit: (limit: number) => void;
  setTab: (tab: DuplicatesTab) => void;
  runAnalysis: () => Promise<void>;
  clearAnalyzeResult: () => void;
}

export const useDuplicatesStore = create<DuplicatesStore>((set, get) => ({
  records: [],
  total: 0,
  page: 1,
  limit: 25,
  loading: false,
  search: '',

  archiveRecords: [],
  archiveTotal: 0,
  archivePage: 1,
  archiveLoading: false,
  archiveSearch: '',

  analyzing: false,
  analyzeResult: null,

  activeTab: 'flagged',

  fetchRecords: async (page = 1) => {
    set({ loading: true });
    const { limit, search } = get();
    try {
      const params: Record<string, unknown> = { page, limit };
      if (search) params.search = search;
      const res = await api.get('/api/admin/duplicates', { params });
      set({ records: res.data.data, total: res.data.total, page, loading: false });
    } catch {
      set({ records: [], total: 0, loading: false });
    }
  },

  fetchArchive: async (page = 1) => {
    set({ archiveLoading: true });
    const { limit, archiveSearch } = get();
    try {
      const params: Record<string, unknown> = { page, limit };
      if (archiveSearch) params.search = archiveSearch;
      const res = await api.get('/api/admin/duplicates/archive', { params });
      set({ archiveRecords: res.data.data, archiveTotal: res.data.total, archivePage: page, archiveLoading: false });
    } catch {
      set({ archiveRecords: [], archiveTotal: 0, archiveLoading: false });
    }
  },

  setSearch: (search) => set({ search }),
  setArchiveSearch: (archiveSearch) => set({ archiveSearch }),
  setLimit: (limit) => set({ limit }),
  setTab: (activeTab) => set({ activeTab }),

  runAnalysis: async () => {
    set({ analyzing: true, analyzeResult: null });
    try {
      const res = await api.post('/api/admin/duplicates/analyze');
      set({ analyzeResult: res.data, analyzing: false });
      // Refresh both lists after analysis
      const { fetchRecords, fetchArchive } = get();
      await Promise.all([fetchRecords(1), fetchArchive(1)]);
    } catch {
      set({ analyzing: false });
    }
  },

  clearAnalyzeResult: () => set({ analyzeResult: null }),
}));
