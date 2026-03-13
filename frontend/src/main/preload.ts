import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { IPC_CHANNELS } from '../shared/types';
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
} from '../shared/types';

const electronAPI = {
  // Scraper controls
  startScrape: (payload: StartScrapePayload): Promise<{ success: boolean; sessionId?: string; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.SCRAPER_START, payload),

  stopScrape: (payload: StopScrapePayload): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.SCRAPER_STOP, payload),

  // Session data
  getAllSessions: (): Promise<SessionState[]> =>
    ipcRenderer.invoke('sessions:getAll'),

  getSession: (sessionId: string): Promise<SessionState | undefined> =>
    ipcRenderer.invoke('sessions:get', sessionId),

  // Settings
  getSettings: (): Promise<AppSettings> =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),

  saveSettings: (payload: SaveSettingsPayload): Promise<AppSettings> =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SAVE, payload),

  // Excel retry
  retryExcelSend: (sessionId: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.EXCEL_RETRY_SEND, sessionId),

  // Open or focus popup window
  openPopup: (sessionId: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.WINDOW_OPEN_POPUP, sessionId),

  // Download Excel via save dialog
  downloadExcel: (sessionId: string): Promise<{ success: boolean; filePath?: string; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.DATA_DOWNLOAD_EXCEL, sessionId),

  // Open AppData Excel folder in Explorer
  openExcelFolder: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.DATA_OPEN_EXCEL_FOLDER),

  // API Logs
  getApiLogs: (sessionId?: string): Promise<ApiLogEntry[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.API_LOGS_GET, sessionId),

  clearApiLogs: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.API_LOGS_CLEAR),

  // Device registration
  registerDevice: (password: string, nickname?: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.DEVICE_REGISTER, password, nickname),

  verifyDevice: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.DEVICE_VERIFY),

  // Dialogs
  selectFolder: (): Promise<string | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.DIALOG_SELECT_FOLDER),

  selectFile: (): Promise<string | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.DIALOG_SELECT_FILE),

  // Event listeners
  onProgress: (callback: (payload: ProgressPayload) => void) => {
    const handler = (_: IpcRendererEvent, payload: ProgressPayload) => callback(payload);
    ipcRenderer.on(IPC_CHANNELS.SCRAPER_PROGRESS, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SCRAPER_PROGRESS, handler);
  },

  onBatchSent: (callback: (payload: BatchSentPayload) => void) => {
    const handler = (_: IpcRendererEvent, payload: BatchSentPayload) => callback(payload);
    ipcRenderer.on(IPC_CHANNELS.SCRAPER_BATCH_SENT, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SCRAPER_BATCH_SENT, handler);
  },

  onComplete: (callback: (payload: CompletePayload) => void) => {
    const handler = (_: IpcRendererEvent, payload: CompletePayload) => callback(payload);
    ipcRenderer.on(IPC_CHANNELS.SCRAPER_COMPLETE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SCRAPER_COMPLETE, handler);
  },

  // Scrape Job (Pincode-Range) — multi-job support
  loadScrapeJob: (payload: { startPincode: number; endPincode: number }): Promise<{ success: boolean; error?: string; job?: ScrapeJobState }> =>
    ipcRenderer.invoke(IPC_CHANNELS.SCRAPE_JOB_LOAD, payload),

  startScrapeJob: (jobId: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.SCRAPE_JOB_START, { jobId }),

  pauseScrapeJob: (jobId: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.SCRAPE_JOB_PAUSE, { jobId }),

  stopScrapeJob: (jobId: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.SCRAPE_JOB_STOP, { jobId }),

  getScrapeJobState: (jobId: string): Promise<ScrapeJobState | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.SCRAPE_JOB_STATE, { jobId }),

  getAllScrapeJobs: (): Promise<ScrapeJobState[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.SCRAPE_JOBS_STATE),

  onScrapeJobProgress: (callback: (job: ScrapeJobState) => void) => {
    const handler = (_: IpcRendererEvent, job: ScrapeJobState) => callback(job);
    ipcRenderer.on(IPC_CHANNELS.SCRAPE_JOB_PROGRESS, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SCRAPE_JOB_PROGRESS, handler);
  },

  // Device Stats (live system monitoring)
  getDeviceStats: (): Promise<DeviceStats> =>
    ipcRenderer.invoke(IPC_CHANNELS.DEVICE_STATS_GET),

  onDeviceStats: (callback: (stats: DeviceStats) => void) => {
    const handler = (_: IpcRendererEvent, stats: DeviceStats) => callback(stats);
    ipcRenderer.on(IPC_CHANNELS.DEVICE_STATS_UPDATE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.DEVICE_STATS_UPDATE, handler);
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

declare global {
  interface Window {
    electronAPI: typeof electronAPI;
  }
}
