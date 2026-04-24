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
  DeviceStats,
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
      registerDevice: (password: string, nickname?: string) => Promise<{ success: boolean; error?: string }>;
      verifyDevice: () => Promise<{ success: boolean; error?: string }>;

      // Dialogs
      selectFolder: () => Promise<string | null>;
      selectFile: () => Promise<string | null>;

      // Scrape Job (Pincode-Range) — multi-job support
      loadScrapeJob: (payload: { startPincode: number; endPincode: number }) => Promise<{ success: boolean; error?: string; job?: ScrapeJobState }>;
      startScrapeJob: (jobId: string) => Promise<{ success: boolean; error?: string }>;
      pauseScrapeJob: (jobId: string) => Promise<{ success: boolean }>;
      stopScrapeJob: (jobId: string) => Promise<{ success: boolean }>;
      getScrapeJobState: (jobId: string) => Promise<ScrapeJobState | null>;
      getAllScrapeJobs: () => Promise<ScrapeJobState[]>;

      // Resolved API base URL from .env config
      getApiBaseUrl: () => Promise<string>;

      // Device Stats (live system monitoring)
      getDeviceStats: () => Promise<DeviceStats>;

      // Event listeners (return unsubscribe fns)
      onProgress: (callback: (payload: ProgressPayload) => void) => () => void;
      onBatchSent: (callback: (payload: BatchSentPayload) => void) => () => void;
      onComplete: (callback: (payload: CompletePayload) => void) => () => void;
      onScrapeJobProgress: (callback: (job: ScrapeJobState) => void) => () => void;
      onDeviceStats: (callback: (stats: DeviceStats) => void) => () => void;
    };
  }
}

export {};
