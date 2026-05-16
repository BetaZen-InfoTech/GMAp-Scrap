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
  // Per-page status tally for the slice this sample row represents. The
  // backend computes one of these per sampled row so the Excel can show how
  // each page breaks down without the admin downloading every page.
  pageSize?:   number;
  pageCounts?: PincodeCounts;
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
   * tell the sampling rate at a glance.
   *
   * By default the download uses the page's current filters. Passing
   * `statusOverride` forces a specific status set instead — used by the
   * dropdown next to the button so an operator can grab "all running pincodes"
   * without having to first ticking the status filter on the page.
   *
   * `statusOverride` semantics:
   *   - undefined  → use the page's current filters.statuses
   *   - []         → no status filter (all statuses)
   *   - [x, y, …]  → only those statuses
   */
  downloadSampleExcel: (
    step: number,
    statusOverride?: PincodeRowStatus[]
  ) => Promise<{ samples: number; sourceCount: number }>;
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

  downloadSampleExcel: async (step, statusOverride) => {
    const { filters, counts } = get();
    const statuses = statusOverride ?? filters.statuses;

    const params: Record<string, string> = { step: String(step) };
    if (filters.state)        params.state        = filters.state;
    if (filters.district)     params.district     = filters.district;
    if (statuses.length)      params.statusFilter = statuses.join(',');

    const { data } = await api.get<SampleResult>('/api/admin/pincodes/coming-status/sample', { params });
    const samples = data.samples || [];
    if (samples.length === 0) {
      const scopeLabel = statuses.length === 0 ? 'the current filters' : statuses.join('/');
      throw new Error(`No pincodes match ${scopeLabel} — nothing to download.`);
    }

    const XLSX = await import('xlsx');
    const scope = statuses.length === 0
      ? 'All'
      : statuses.length === 1
        ? statuses[0].charAt(0).toUpperCase() + statuses[0].slice(1)
        : statuses.length + ' statuses';

    // ── Build the sheet as an array-of-arrays so we can prepend a summary
    //    block before the data table. AOA gives precise row control whereas
    //    json_to_sheet only knows about (header + rows).
    //
    //    Layout (per-row breakdown):
    //      r0: title banner
    //      r1: total scope (overall count)
    //      r2: "Running"   | count
    //      r3: "Completed" | count
    //      r4: "Stop"      | count
    //      r5: "Pending"   | count
    //      r6: filters line
    //      r7: blank spacer
    //      r8: column headers
    //      r9+: data
    const filterParts: string[] = [];
    if (filters.state)    filterParts.push(`State: ${filters.state}`);
    if (filters.district) filterParts.push(`District: ${filters.district}`);
    filterParts.push(`Status: ${scope}`);

    const title      = `Coming Pincodes — Sampled every ${step} (${scope})`;
    const totalLine  = `Total: ${data.sourceCount.toLocaleString()}`;
    const filterLine = `Filters — ${filterParts.join('   ·   ')}`;

    const headerCols = [
      'Page #', 'Source Index', 'Page Size',
      // Per-page status counts — Running/Completed/Stop/Pending for the
      // slice of `step` pincodes this sample row stands in for.
      'Page Running', 'Page Completed', 'Page Stop', 'Page Pending',
      'Pincode', 'District', 'State', 'Status',
      'Completed Rounds', 'Completed Searches', 'Total Niches',
      'Last Activity', 'Last Run At', 'Updated At',
    ];
    const dataRows = samples.map((s) => {
      const pc = s.pageCounts || { running: 0, completed: 0, stop: 0, pending: 0 };
      return [
        s.pageNumber,
        s.sourceIndex,
        s.pageSize ?? step,
        pc.running,
        pc.completed,
        pc.stop,
        pc.pending,
        s.pincode,
        s.district || '',
        s.stateName || '',
        s.status,
        (s.completedRounds || []).join(','),
        s.completedSearches,
        s.totalNiches,
        s.lastActivity || '',
        s.lastRunAt || '',
        s.updatedAt || '',
      ];
    });
    const aoa: (string | number)[][] = [
      [title],
      [totalLine],
      ['Running',   counts.running],
      ['Completed', counts.completed],
      ['Stop',      counts.stop],
      ['Pending',   counts.pending],
      [filterLine],
      [],
      headerCols,
      ...dataRows,
    ];
    const dataStartRow = 9; // row 10 in 1-based Excel terms

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [
      // Page # | Src Idx | Page Size
      { wch: 8 }, { wch: 12 }, { wch: 10 },
      // Page Running | Page Completed | Page Stop | Page Pending
      { wch: 14 }, { wch: 16 }, { wch: 11 }, { wch: 14 },
      // Pincode | District | State | Status
      { wch: 10 }, { wch: 22 }, { wch: 18 }, { wch: 12 },
      // Completed Rounds | Completed Searches | Total Niches
      { wch: 18 }, { wch: 20 }, { wch: 12 },
      // Last Activity | Last Run At | Updated At
      { wch: 24 }, { wch: 24 }, { wch: 24 },
    ];
    // Merge the wide banner rows across all data columns. The per-status
    // rows stay as (label | count) — they're meant to look like a small
    // stat table in columns A + B.
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: headerCols.length - 1 } },  // title
      { s: { r: 1, c: 0 }, e: { r: 1, c: headerCols.length - 1 } },  // total
      { s: { r: 6, c: 0 }, e: { r: 6, c: headerCols.length - 1 } },  // filters
    ];
    ws['!freeze'] = { xSplit: 0, ySplit: dataStartRow };

    const wb = XLSX.utils.book_new();
    // Sheet name = "Every <step> <Status> (<n> rows)" — Excel caps at 31 chars
    // and disallows []:*?/\.
    const sheetName = `Every ${step} ${scope} (${samples.length})`.slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileScope = statuses.length === 1 ? `-${statuses[0]}` : statuses.length === 0 ? '-all' : '';
    XLSX.writeFile(wb, `coming-pincodes-sample-step${step}${fileScope}-${ts}.xlsx`);

    return { samples: samples.length, sourceCount: data.sourceCount };
  },
}));
