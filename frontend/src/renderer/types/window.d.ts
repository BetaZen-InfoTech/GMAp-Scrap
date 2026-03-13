import type {
  StartScrapePayload,
  StopScrapePayload,
  SaveSettingsPayload,
  AppSettings,
  SessionState,
  ProgressPayload,
  BatchSentPayload,
  CompletePayload,
  ApiLogEntry,
  ScrapeJobState,
} from '../../shared/types';

declare global {
  interface Window {
    electronAPI: {
      // Scraper controls
      startScrape: (payload: StartScrapePayload) => Promise<{ success: boolean; sessionId?: string; error?: string }>;
      stopScrape: (payload: StopScrapePayload) => Promise<{ success: boolean; error?: string }>;

      // Session data
      getAllSessions: () => Promise<SessionState[]>;
      getSession: (sessionId: string) => Promise<SessionState | undefined>;

      // Settings
      getSettings: () => Promise<AppSettings>;
      saveSettings: (payload: SaveSettingsPayload) => Promise<AppSettings>;

      // Excel
      retryExcelSend: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
      downloadExcel: (sessionId: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
      openExcelFolder: () => Promise<{ success: boolean }>;

      // Windows / popup
      openPopup: (sessionId: string) => Promise<{ success: boolean }>;

      // API Logs
      getApiLogs: (sessionId?: string) => Promise<ApiLogEntry[]>;
      clearApiLogs: () => Promise<{ success: boolean }>;

      // Device registration
      registerDevice: (password: string) => Promise<{ success: boolean; error?: string }>;
      verifyDevice: () => Promise<{ success: boolean; error?: string }>;

      // Dialogs
      selectFolder: () => Promise<string | null>;
      selectFile: () => Promise<string | null>;

      // Scrape Job (Pincode-Range)
      loadScrapeJob: (payload: { startPincode: number; endPincode: number }) => Promise<{ success: boolean; error?: string; job?: ScrapeJobState }>;
      startScrapeJob: () => Promise<{ success: boolean; error?: string }>;
      pauseScrapeJob: () => Promise<{ success: boolean }>;
      stopScrapeJob: () => Promise<{ success: boolean }>;
      getScrapeJobState: () => Promise<ScrapeJobState | null>;

      // Event listeners
      onProgress: (callback: (payload: ProgressPayload) => void) => () => void;
      onBatchSent: (callback: (payload: BatchSentPayload) => void) => () => void;
      onComplete: (callback: (payload: CompletePayload) => void) => () => void;
      onScrapeJobProgress: (callback: (job: ScrapeJobState) => void) => () => void;
    };
  }
}

export {};
