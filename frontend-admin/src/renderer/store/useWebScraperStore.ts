import { create } from 'zustand';

export interface ScrapeProgress {
  total: number;
  done: number;
  newPhones: number;
  newEmails: number;
  newRecords: number;
  errors: number;
  log: string[];
}

interface WebScraperState {
  scraping: boolean;
  progress: ScrapeProgress | null;
  aborted: boolean;

  setScraping: (v: boolean) => void;
  setProgress: (updater: ScrapeProgress | null | ((p: ScrapeProgress | null) => ScrapeProgress | null)) => void;
  abort: () => void;
  resetAbort: () => void;
}

export const useWebScraperStore = create<WebScraperState>((set, get) => ({
  scraping: false,
  progress: null,
  aborted: false,

  setScraping: (v) => set({ scraping: v }),
  setProgress: (updater) => {
    if (typeof updater === 'function') {
      set({ progress: updater(get().progress) });
    } else {
      set({ progress: updater });
    }
  },
  abort: () => set({ aborted: true }),
  resetAbort: () => set({ aborted: false }),
}));
