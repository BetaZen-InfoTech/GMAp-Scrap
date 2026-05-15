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

  // Per-id selection only. When `selectAllPages` is true the user has opted
  // into a cross-page bulk action and `selectedIds` is ignored — the action
  // runs against the current search filter on the server side.
  selectedIds: Set<string>;
  selectAllPages: boolean;

  restoring: boolean;
  purging: boolean;
  lastActionResult: { kind: 'restore' | 'purge'; count: number } | null;

  fetchRecords: (page?: number) => Promise<void>;
  setSearch: (search: string) => void;
  setLimit: (limit: number) => void;

  toggleSelect: (id: string) => void;
  selectThisPage: () => void;     // add current page ids to selection (no flag)
  deselectThisPage: () => void;   // remove current page ids only
  selectAll: () => void;          // flip cross-page flag
  clearSelection: () => void;     // clear both ids + flag

  // Restore/purge inspect `selectAllPages` and call the right endpoint:
  //   - flag set → server-side filter restore/purge (handles millions safely)
  //   - flag clear → ids-only restore/purge (capped by `selectedIds.size`)
  restoreSelected: (password: string) => Promise<{ success: boolean; error?: string }>;
  purgeSelected:   (password: string) => Promise<{ success: boolean; error?: string }>;
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
  selectAllPages: false,

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

  setSearch: (search) => set({ search, selectAllPages: false }),
  setLimit: (limit) => set({ limit }),

  toggleSelect: (id) => {
    // Toggling a single row leaves the cross-page flag intact only if we still
    // want every record. If you tick off one row after Select All, we drop the
    // flag and fall back to per-id selection (current visible page minus that one).
    const { selectedIds, selectAllPages, records } = get();
    if (selectAllPages) {
      const next = new Set<string>(records.map((r) => r._id));
      next.delete(id);
      set({ selectedIds: next, selectAllPages: false });
      return;
    }
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    set({ selectedIds: next });
  },

  selectThisPage: () => {
    const { records, selectedIds } = get();
    const next = new Set(selectedIds);
    for (const r of records) next.add(r._id);
    set({ selectedIds: next });
  },

  deselectThisPage: () => {
    const { records, selectedIds, selectAllPages } = get();
    // If the cross-page flag is on, materialize it as "everything except this page"
    if (selectAllPages) {
      set({ selectedIds: new Set<string>(), selectAllPages: false });
      return;
    }
    const next = new Set(selectedIds);
    for (const r of records) next.delete(r._id);
    set({ selectedIds: next });
  },

  selectAll: () => set({ selectAllPages: true, selectedIds: new Set<string>() }),

  clearSelection: () => set({ selectedIds: new Set<string>(), selectAllPages: false }),

  restoreSelected: async (password) => {
    const { selectedIds, selectAllPages, search } = get();
    if (!selectAllPages && selectedIds.size === 0) {
      return { success: false, error: 'No records selected' };
    }
    set({ restoring: true });
    try {
      let res;
      if (selectAllPages) {
        const filter: Record<string, unknown> = {};
        if (search) filter.search = search;
        res = await api.post('/api/admin/deleted-records/restore-all', { filter, password });
      } else {
        res = await api.post('/api/admin/deleted-records/restore', {
          ids: [...selectedIds],
          password,
        });
      }
      set({
        restoring: false,
        lastActionResult: { kind: 'restore', count: res.data.restoredCount || 0 },
        selectedIds: new Set(),
        selectAllPages: false,
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
    const { selectedIds, selectAllPages, search } = get();
    if (!selectAllPages && selectedIds.size === 0) {
      return { success: false, error: 'No records selected' };
    }
    set({ purging: true });
    try {
      const payload: Record<string, unknown> = { password };
      if (selectAllPages) {
        const filter: Record<string, unknown> = {};
        if (search) filter.search = search;
        payload.filter = filter;
      } else {
        payload.ids = [...selectedIds];
      }
      const res = await api.delete('/api/admin/deleted-records/purge', { data: payload });
      set({
        purging: false,
        lastActionResult: { kind: 'purge', count: res.data.purgedCount || 0 },
        selectedIds: new Set(),
        selectAllPages: false,
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
