import { create } from 'zustand';
import api from '../lib/api';
import type { ScrapedDataRecord } from '../../shared/types';

export type ViewMode = 'table' | 'card' | 'excel';

export interface ScrapDbFilters {
  search?: string;
  category?: string;
  pincode?: string;
  missingPhone?: boolean;
  missingAddress?: boolean;
  missingWebsite?: boolean;
  missingEmail?: boolean;
}

interface ScrapDatabaseStore {
  records: ScrapedDataRecord[];
  total: number;
  page: number;
  limit: number;
  loading: boolean;
  filters: ScrapDbFilters;
  filterOptions: { categories: string[]; pincodes: string[] };
  viewMode: ViewMode;
  selectedIds: Set<string>;
  selectAllPages: boolean;

  fetchRecords: (page?: number) => Promise<void>;
  fetchFilterOptions: () => Promise<void>;
  setFilters: (filters: Partial<ScrapDbFilters>) => void;
  clearFilters: () => void;
  setViewMode: (mode: ViewMode) => void;
  setLimit: (limit: number) => void;

  // Selection
  toggleSelect: (id: string) => void;
  selectPage: () => void;
  selectAll: () => void;
  clearSelection: () => void;

  // Soft delete
  softDeleteSelected: () => Promise<number>;
  softDeleteAllFiltered: () => Promise<number>;
}

function filtersToParams(filters: ScrapDbFilters): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.search) params.search = filters.search;
  if (filters.category) params.category = filters.category;
  if (filters.pincode) params.pincode = filters.pincode;
  if (filters.missingPhone) params.missingPhone = 'true';
  if (filters.missingAddress) params.missingAddress = 'true';
  if (filters.missingWebsite) params.missingWebsite = 'true';
  if (filters.missingEmail) params.missingEmail = 'true';
  return params;
}

export const useScrapDatabaseStore = create<ScrapDatabaseStore>((set, get) => ({
  records: [],
  total: 0,
  page: 1,
  limit: 25,
  loading: false,
  filters: {},
  filterOptions: { categories: [], pincodes: [] },
  viewMode: 'table',
  selectedIds: new Set(),
  selectAllPages: false,

  fetchRecords: async (page = 1) => {
    set({ loading: true });
    const { limit, filters } = get();
    try {
      const params: Record<string, unknown> = { page, limit, ...filtersToParams(filters) };
      const res = await api.get('/api/admin/scrap-database', { params });
      set({ records: res.data.data, total: res.data.total, page, loading: false });
    } catch {
      set({ records: [], total: 0, loading: false });
    }
  },

  fetchFilterOptions: async () => {
    try {
      const res = await api.get('/api/admin/scrap-database/filters');
      set({ filterOptions: res.data });
    } catch {
      /* noop */
    }
  },

  setFilters: (filters) => set((s) => ({ filters: { ...s.filters, ...filters } })),
  clearFilters: () => set({ filters: {}, selectedIds: new Set(), selectAllPages: false }),
  setViewMode: (viewMode) => set({ viewMode }),
  setLimit: (limit) => set({ limit }),

  toggleSelect: (id) =>
    set((s) => {
      const next = new Set(s.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedIds: next, selectAllPages: false };
    }),

  selectPage: () =>
    set((s) => {
      const next = new Set(s.selectedIds);
      s.records.forEach((r) => next.add(r._id));
      return { selectedIds: next, selectAllPages: false };
    }),

  selectAll: () => set({ selectAllPages: true }),

  clearSelection: () => set({ selectedIds: new Set(), selectAllPages: false }),

  softDeleteSelected: async () => {
    const { selectedIds, fetchRecords, page } = get();
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return 0;
    const res = await api.patch('/api/admin/scrap-database/soft-delete', { ids });
    set({ selectedIds: new Set(), selectAllPages: false });
    await fetchRecords(page);
    return res.data.modifiedCount;
  },

  softDeleteAllFiltered: async () => {
    const { filters, fetchRecords } = get();
    const body: Record<string, unknown> = {};
    if (filters.search) body.search = filters.search;
    if (filters.category) body.category = filters.category;
    if (filters.pincode) body.pincode = filters.pincode;
    if (filters.missingPhone) body.missingPhone = true;
    if (filters.missingAddress) body.missingAddress = true;
    if (filters.missingWebsite) body.missingWebsite = true;
    if (filters.missingEmail) body.missingEmail = true;
    const res = await api.patch('/api/admin/scrap-database/soft-delete-filter', body);
    set({ selectedIds: new Set(), selectAllPages: false });
    await fetchRecords(1);
    return res.data.modifiedCount;
  },
}));
