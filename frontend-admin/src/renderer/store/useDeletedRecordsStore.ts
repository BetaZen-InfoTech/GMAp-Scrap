import { create } from 'zustand';
import api from '../lib/api';
import type { ScrapedDataRecord } from '../../shared/types';

// Deleted records carry the same shape as ScrapedDataRecord plus deletedAt + originalId
export type DeletedRecord = ScrapedDataRecord & {
  deletedAt?: string;
  originalId?: string;
};

interface DeletedRecordsStore {
  records: DeletedRecord[];
  total: number;
  page: number;
  limit: number;
  loading: boolean;
  search: string;

  selectedIds: Set<string>;

  restoring: boolean;
  purging: boolean;
  lastActionResult: { kind: 'restore' | 'purge'; count: number } | null;

  fetchRecords: (page?: number) => Promise<void>;
  setSearch: (search: string) => void;
  setLimit: (limit: number) => void;

  toggleSelect: (id: string) => void;
  selectAllOnPage: () => void;
  clearSelection: () => void;

  restoreSelected: (password: string) => Promise<{ success: boolean; error?: string }>;
  restoreAllFiltered: (password: string) => Promise<{ success: boolean; error?: string }>;
  purgeSelected: (password: string) => Promise<{ success: boolean; error?: string }>;
  clearResult: () => void;
}

export const useDeletedRecordsStore = create<DeletedRecordsStore>((set, get) => ({
  records: [],
  total: 0,
  page: 1,
  limit: 25,
  loading: false,
  search: '',

  selectedIds: new Set<string>(),

  restoring: false,
  purging: false,
  lastActionResult: null,

  fetchRecords: async (page = 1) => {
    set({ loading: true });
    const { limit, search } = get();
    try {
      const params: Record<string, unknown> = { page, limit };
      if (search) params.search = search;
      const res = await api.get('/api/admin/deleted-records', { params });
      set({ records: res.data.data, total: res.data.total, page, loading: false });
    } catch {
      set({ records: [], total: 0, loading: false });
    }
  },

  setSearch: (search) => set({ search }),
  setLimit: (limit) => set({ limit }),

  toggleSelect: (id) => {
    const next = new Set(get().selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    set({ selectedIds: next });
  },

  selectAllOnPage: () => {
    const { records, selectedIds } = get();
    const next = new Set(selectedIds);
    for (const r of records) next.add(r._id);
    set({ selectedIds: next });
  },

  clearSelection: () => set({ selectedIds: new Set<string>() }),

  restoreSelected: async (password) => {
    const ids = [...get().selectedIds];
    if (ids.length === 0) return { success: false, error: 'No records selected' };
    set({ restoring: true });
    try {
      const res = await api.post('/api/admin/deleted-records/restore', { ids, password });
      set({
        restoring: false,
        lastActionResult: { kind: 'restore', count: res.data.restoredCount || 0 },
        selectedIds: new Set(),
      });
      await get().fetchRecords(1);
      return { success: true };
    } catch (err) {
      set({ restoring: false });
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      return { success: false, error: e.response?.data?.error || e.message || 'Restore failed' };
    }
  },

  restoreAllFiltered: async (password) => {
    set({ restoring: true });
    try {
      const filter: Record<string, unknown> = {};
      if (get().search) filter.search = get().search;
      const res = await api.post('/api/admin/deleted-records/restore-all', { filter, password });
      set({
        restoring: false,
        lastActionResult: { kind: 'restore', count: res.data.restoredCount || 0 },
        selectedIds: new Set(),
      });
      await get().fetchRecords(1);
      return { success: true };
    } catch (err) {
      set({ restoring: false });
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      return { success: false, error: e.response?.data?.error || e.message || 'Restore failed' };
    }
  },

  purgeSelected: async (password) => {
    const ids = [...get().selectedIds];
    if (ids.length === 0) return { success: false, error: 'No records selected' };
    set({ purging: true });
    try {
      const res = await api.delete('/api/admin/deleted-records/purge', {
        data: { ids, password },
      });
      set({
        purging: false,
        lastActionResult: { kind: 'purge', count: res.data.purgedCount || 0 },
        selectedIds: new Set(),
      });
      await get().fetchRecords(1);
      return { success: true };
    } catch (err) {
      set({ purging: false });
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      return { success: false, error: e.response?.data?.error || e.message || 'Purge failed' };
    }
  },

  clearResult: () => set({ lastActionResult: null }),
}));
