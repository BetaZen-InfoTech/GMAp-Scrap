import { create } from 'zustand';
import api from '../lib/api';
import type { ScrapedDataRecord } from '../../shared/types';

export type ViewMode = 'table' | 'card' | 'excel';

export interface ScrapDbFilters {
  search?: string;
  category?: string[];
  scrapCategory?: string[];
  scrapSubCategory?: string[];
  pincode?: string[];
  missingPhone?: boolean;
  missingAddress?: boolean;
  missingWebsite?: boolean;
  missingEmail?: boolean;
  hasPhone?: boolean;
  hasAddress?: boolean;
  hasWebsite?: boolean;
  hasEmail?: boolean;
  minRating?: number;
  maxRating?: number;
  minReviews?: number;
  maxReviews?: number;
  scrapWebsite?: boolean;
}

interface ScrapDatabaseStore {
  records: ScrapedDataRecord[];
  total: number;
  page: number;
  limit: number;
  loading: boolean;
  filters: ScrapDbFilters;
  filterOptions: { categories: string[]; scrapCategories: string[]; scrapSubCategories: string[]; pincodes: string[] };
  viewMode: ViewMode;
  selectedIds: Set<string>;
  selectAllPages: boolean;

  fetchRecords: (page?: number) => Promise<void>;
  fetchFilterOptions: (scrapCategories?: string[]) => Promise<void>;
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

  // Phone normalization backfill
  fixNumbers: () => Promise<{ scanned: number; modified: number }>;
}

function filtersToParams(filters: ScrapDbFilters): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.search) params.search = filters.search;
  if (filters.category?.length) params.category = filters.category.join(',');
  if (filters.scrapCategory?.length) params.scrapCategory = filters.scrapCategory.join(',');
  if (filters.scrapSubCategory?.length) params.scrapSubCategory = filters.scrapSubCategory.join(',');
  if (filters.pincode?.length) params.pincode = filters.pincode.join(',');
  if (filters.missingPhone) params.missingPhone = 'true';
  if (filters.missingAddress) params.missingAddress = 'true';
  if (filters.missingWebsite) params.missingWebsite = 'true';
  if (filters.missingEmail) params.missingEmail = 'true';
  if (filters.hasPhone) params.hasPhone = 'true';
  if (filters.hasAddress) params.hasAddress = 'true';
  if (filters.hasWebsite) params.hasWebsite = 'true';
  if (filters.hasEmail) params.hasEmail = 'true';
  if (filters.minRating != null) params.minRating = String(filters.minRating);
  if (filters.maxRating != null) params.maxRating = String(filters.maxRating);
  if (filters.minReviews != null) params.minReviews = String(filters.minReviews);
  if (filters.maxReviews != null) params.maxReviews = String(filters.maxReviews);
  if (filters.scrapWebsite === true) params.scrapWebsite = 'true';
  if (filters.scrapWebsite === false) params.scrapWebsite = 'false';
  return params;
}

export const useScrapDatabaseStore = create<ScrapDatabaseStore>((set, get) => ({
  records: [],
  total: 0,
  page: 1,
  limit: 25,
  loading: false,
  filters: {},
  filterOptions: { categories: [], scrapCategories: [], scrapSubCategories: [], pincodes: [] },
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

  fetchFilterOptions: async (scrapCategories?: string[]) => {
    try {
      const params: Record<string, string> = {};
      if (scrapCategories?.length) params.scrapCategory = scrapCategories.join(',');
      const res = await api.get('/api/admin/scrap-database/filters', { params });
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
    const body: Record<string, unknown> = filtersToParams(filters);
    const res = await api.patch('/api/admin/scrap-database/soft-delete-filter', body);
    set({ selectedIds: new Set(), selectAllPages: false });
    await fetchRecords(1);
    return res.data.modifiedCount;
  },

  fixNumbers: async () => {
    const { fetchRecords, page } = get();
    const res = await api.post('/api/admin/scrap-database/fix-numbers');
    await fetchRecords(page);
    return { scanned: res.data.scanned || 0, modified: res.data.modified || 0 };
  },
}));
