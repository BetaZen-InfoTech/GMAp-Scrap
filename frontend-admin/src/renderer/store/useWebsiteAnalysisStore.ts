import { create } from 'zustand';
import api from '../lib/api';

export type WebsiteAnalysisStatus = 'queued' | 'running' | 'completed' | 'error' | 'stopped';

export interface WebsiteAnalysisJob {
  _id: string;
  status: WebsiteAnalysisStatus;
  triggeredBy?: string;
  startedAt: string;
  completedAt?: string;
  lastProgressAt?: string;
  totalToProcess: number;
  processed: number;
  inserted: number;
  skipped: number;
  errored: number;
  errorMessage?: string;
  createdAt?: string;
}

export interface WebsiteAnalysisRecord {
  _id: string;
  name?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  category?: string;
  pincode?: string;
  rating?: number;
  reviews?: number;
  scrapedAt?: string;
  createdAt?: string;
}

interface WebsiteAnalysisStore {
  // Jobs (history + currently running)
  jobs: WebsiteAnalysisJob[];
  jobsTotal: number;
  jobsPage: number;
  jobsLimit: number;
  jobsLoading: boolean;
  archiveTotal: number;

  // Browse the deduped archive
  records: WebsiteAnalysisRecord[];
  recordsTotal: number;
  recordsPage: number;
  recordsLimit: number;
  recordsLoading: boolean;
  recordsSearch: string;

  // Start-action state
  starting: boolean;
  startResult: { alreadyRunning: boolean; message: string; jobId: string } | null;
  startError: string | null;

  fetchJobs: (page?: number) => Promise<void>;
  pollActiveJob: () => Promise<WebsiteAnalysisJob | null>;
  start: () => Promise<{ success: boolean; alreadyRunning?: boolean; jobId?: string; error?: string }>;
  fetchRecords: (page?: number) => Promise<void>;
  setRecordsSearch: (search: string) => void;
  setRecordsLimit: (limit: number) => void;
  clearStartResult: () => void;
}

export const useWebsiteAnalysisStore = create<WebsiteAnalysisStore>((set, get) => ({
  jobs: [],
  jobsTotal: 0,
  jobsPage: 1,
  jobsLimit: 10,
  jobsLoading: false,
  archiveTotal: 0,

  records: [],
  recordsTotal: 0,
  recordsPage: 1,
  recordsLimit: 25,
  recordsLoading: false,
  recordsSearch: '',

  starting: false,
  startResult: null,
  startError: null,

  fetchJobs: async (page = 1) => {
    set({ jobsLoading: true });
    const { jobsLimit } = get();
    try {
      const res = await api.get('/api/admin/website-analysis/jobs', {
        params: { page, limit: jobsLimit },
      });
      set({
        jobs: res.data.data,
        jobsTotal: res.data.total,
        archiveTotal: res.data.archiveTotal || 0,
        jobsPage: page,
        jobsLoading: false,
      });
    } catch {
      set({ jobsLoading: false });
    }
  },

  // Refetch the single running/queued job for live progress polling — cheaper
  // than refetching the entire jobs list every couple seconds. Returns the job
  // doc so the page can decide whether to keep polling.
  pollActiveJob: async () => {
    const { jobs } = get();
    const active = jobs.find((j) => j.status === 'running' || j.status === 'queued');
    if (!active) return null;
    try {
      const res = await api.get(`/api/admin/website-analysis/jobs/${active._id}`);
      const fresh: WebsiteAnalysisJob = res.data;
      set({
        jobs: jobs.map((j) => (j._id === fresh._id ? fresh : j)),
      });
      return fresh;
    } catch {
      return null;
    }
  },

  start: async () => {
    set({ starting: true, startError: null });
    try {
      const res = await api.post('/api/admin/website-analysis/start');
      set({
        starting: false,
        startResult: {
          alreadyRunning: !!res.data.alreadyRunning,
          message: res.data.message || 'Website-analysis job started',
          jobId: res.data.job?._id,
        },
      });
      await get().fetchJobs(1);
      return { success: true, alreadyRunning: !!res.data.alreadyRunning, jobId: res.data.job?._id };
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      const msg = e.response?.data?.error || e.message || 'Failed to start';
      set({ starting: false, startError: msg });
      return { success: false, error: msg };
    }
  },

  fetchRecords: async (page = 1) => {
    set({ recordsLoading: true });
    const { recordsLimit, recordsSearch } = get();
    try {
      const params: Record<string, unknown> = { page, limit: recordsLimit };
      if (recordsSearch) params.search = recordsSearch;
      const res = await api.get('/api/admin/website-analysis/records', { params });
      set({
        records: res.data.data,
        recordsTotal: res.data.total,
        recordsPage: page,
        recordsLoading: false,
      });
    } catch {
      set({ records: [], recordsTotal: 0, recordsLoading: false });
    }
  },

  setRecordsSearch: (search) => set({ recordsSearch: search }),
  setRecordsLimit: (limit) => set({ recordsLimit: limit }),
  clearStartResult: () => set({ startResult: null, startError: null }),
}));
