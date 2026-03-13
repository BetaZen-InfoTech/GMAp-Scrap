import { ipcMain, dialog, BrowserWindow, shell } from 'electron';
import {
  IPC_CHANNELS,
  StartScrapePayload,
  StopScrapePayload,
  SaveSettingsPayload,
  ProgressPayload,
  BatchSentPayload,
  CompletePayload,
  ScrapeJobState,
} from '../shared/types';
import { getSettings, saveSettings } from './store';
import { registerDevice, verifyDevice } from './deviceAuth';
import { SessionManager } from './sessionManager';
import { ScrapeJobManager } from './scrapeJobManager';
import { createPopupWindow, getDashboardWindows, getPopupWindow } from './windowManager';
import { readApiLogs, clearApiLogs } from './apiLogger';
import { getExcelDir } from './dataStore';
import { getSystemStats } from './deviceMonitor';
import { addStatSnapshot, getPendingStats, clearPendingStats } from './deviceHistoryStore';
import { getApiBaseUrl } from './config';
import axios from 'axios';
import fs from 'fs';

let sessionManager: SessionManager;
let scrapeJobManager: ScrapeJobManager;

function broadcastToAll(channel: string, data: unknown): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) win.webContents.send(channel, data);
  });
}

function broadcastToDashboard(channel: string, data: unknown): void {
  getDashboardWindows().forEach((win) => {
    if (!win.isDestroyed()) win.webContents.send(channel, data);
  });
}

function broadcastToPopup(sessionId: string, channel: string, data: unknown): void {
  const win = getPopupWindow(sessionId);
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
}

export function setupIpcHandlers(): void {
  const settings = getSettings();

  sessionManager = new SessionManager(settings, {
    onProgress: (payload: ProgressPayload) => {
      broadcastToDashboard(IPC_CHANNELS.SCRAPER_PROGRESS, payload);
      broadcastToPopup(payload.sessionId, IPC_CHANNELS.SCRAPER_PROGRESS, payload);
    },
    onBatchSent: (payload: BatchSentPayload) => {
      broadcastToDashboard(IPC_CHANNELS.SCRAPER_BATCH_SENT, payload);
      broadcastToPopup(payload.sessionId, IPC_CHANNELS.SCRAPER_BATCH_SENT, payload);
    },
    onComplete: (payload: CompletePayload) => {
      broadcastToDashboard(IPC_CHANNELS.SCRAPER_COMPLETE, payload);
      broadcastToPopup(payload.sessionId, IPC_CHANNELS.SCRAPER_COMPLETE, payload);
    },
  });

  // SessionEvents shared by all job-specific SessionManagers
  const jobSessionEvents = {
    onProgress: (payload: ProgressPayload) => {
      broadcastToDashboard(IPC_CHANNELS.SCRAPER_PROGRESS, payload);
    },
    onBatchSent: (payload: BatchSentPayload) => {
      broadcastToDashboard(IPC_CHANNELS.SCRAPER_BATCH_SENT, payload);
    },
    onComplete: (payload: CompletePayload) => {
      broadcastToDashboard(IPC_CHANNELS.SCRAPER_COMPLETE, payload);
    },
  };

  scrapeJobManager = new ScrapeJobManager(settings, jobSessionEvents, (job: ScrapeJobState) => {
    broadcastToDashboard(IPC_CHANNELS.SCRAPE_JOB_PROGRESS, job);
  });

  // Start scrape
  ipcMain.handle(IPC_CHANNELS.SCRAPER_START, async (_, payload: StartScrapePayload) => {
    try {
      const sessionId = sessionManager.startSession(payload.keyword, payload.browser);
      return { success: true, sessionId };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Stop scrape
  ipcMain.handle(IPC_CHANNELS.SCRAPER_STOP, async (_, payload: StopScrapePayload) => {
    try {
      await sessionManager.stopSession(payload.sessionId);
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Get all sessions (main + all job-specific SessionManagers)
  ipcMain.handle('sessions:getAll', async () => {
    const mainSessions = sessionManager.getAllSessions();
    const jobSessions = scrapeJobManager.getAllJobSessions();
    // Merge and sort by startTime descending (deduplicate by session id)
    const seen = new Set<string>();
    const all = [...mainSessions, ...jobSessions].filter((s) => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });
    all.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
    return all;
  });

  // Get single session — check main sessionManager first, then all job-specific ones
  ipcMain.handle('sessions:get', async (_, sessionId: string) => {
    return sessionManager.getSession(sessionId) ?? scrapeJobManager.getSessionById(sessionId);
  });

  // Get settings
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async () => getSettings());

  // Save settings
  ipcMain.handle(IPC_CHANNELS.SETTINGS_SAVE, async (_, payload: SaveSettingsPayload) => {
    const updated = saveSettings(payload.settings);
    sessionManager.updateSettings(updated);
    scrapeJobManager.updateSettings(updated);
    return updated;
  });

  // Retry Excel send
  ipcMain.handle(IPC_CHANNELS.EXCEL_RETRY_SEND, async (_, sessionId: string) => {
    try {
      await sessionManager.retryExcelSend(sessionId);
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Open or focus popup window for a session
  ipcMain.handle(IPC_CHANNELS.WINDOW_OPEN_POPUP, async (_, sessionId: string) => {
    const existing = getPopupWindow(sessionId);
    if (existing && !existing.isDestroyed()) {
      if (existing.isMinimized()) existing.restore();
      existing.focus();
    } else {
      createPopupWindow(sessionId);
    }
    return { success: true };
  });

  // Download Excel — show save dialog and copy file
  ipcMain.handle(IPC_CHANNELS.DATA_DOWNLOAD_EXCEL, async (event, sessionId: string) => {
    const session = sessionManager.getSession(sessionId);
    if (!session?.excelPath || !fs.existsSync(session.excelPath)) {
      return { success: false, error: 'Excel file not found' };
    }
    const win = BrowserWindow.fromWebContents(event.sender);
    const fileName = require('path').basename(session.excelPath);
    const result = await dialog.showSaveDialog(win!, {
      title: 'Download Excel File',
      defaultPath: fileName,
      filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
    });
    if (result.canceled || !result.filePath) return { success: false, error: 'Cancelled' };
    try {
      fs.copyFileSync(session.excelPath, result.filePath);
      return { success: true, filePath: result.filePath };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Open Excel folder in Explorer
  ipcMain.handle(IPC_CHANNELS.DATA_OPEN_EXCEL_FOLDER, async () => {
    shell.openPath(getExcelDir());
    return { success: true };
  });

  // Get API logs
  ipcMain.handle(IPC_CHANNELS.API_LOGS_GET, async (_, sessionId?: string) => {
    return readApiLogs(500, sessionId);
  });

  // Clear API logs
  ipcMain.handle(IPC_CHANNELS.API_LOGS_CLEAR, async () => {
    clearApiLogs();
    return { success: true };
  });

  // Device: register
  ipcMain.handle(IPC_CHANNELS.DEVICE_REGISTER, async (_, password: string, nickname?: string) => {
    return registerDevice(password, nickname);
  });

  // Device: verify
  ipcMain.handle(IPC_CHANNELS.DEVICE_VERIFY, async () => {
    return verifyDevice();
  });

  // Scrape Job: load (fetch pincodes + niches, create job)
  ipcMain.handle(IPC_CHANNELS.SCRAPE_JOB_LOAD, async (_, payload: { startPincode: number; endPincode: number }) => {
    try {
      const currentSettings = getSettings();
      const job = await scrapeJobManager.load(payload.startPincode, payload.endPincode, currentSettings.deviceId);
      return { success: true, job };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Scrape Job: start or resume (requires jobId)
  ipcMain.handle(IPC_CHANNELS.SCRAPE_JOB_START, async (_, payload: { jobId: string }) => {
    try {
      // Don't await — runs in background
      scrapeJobManager.start(payload.jobId).catch((err) => {
        console.error('[ScrapeJob] start error:', err);
      });
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Scrape Job: pause (requires jobId)
  ipcMain.handle(IPC_CHANNELS.SCRAPE_JOB_PAUSE, async (_, payload: { jobId: string }) => {
    scrapeJobManager.pause(payload.jobId);
    return { success: true };
  });

  // Scrape Job: stop and clear (requires jobId)
  ipcMain.handle(IPC_CHANNELS.SCRAPE_JOB_STOP, async (_, payload: { jobId: string }) => {
    scrapeJobManager.stop(payload.jobId);
    return { success: true };
  });

  // Scrape Job: get specific job state
  ipcMain.handle(IPC_CHANNELS.SCRAPE_JOB_STATE, async (_, payload: { jobId: string }) => {
    return scrapeJobManager.getState(payload.jobId);
  });

  // Scrape Jobs: get all active jobs
  ipcMain.handle(IPC_CHANNELS.SCRAPE_JOBS_STATE, async () => {
    return scrapeJobManager.getAllStates();
  });

  // Dialog: select folder
  ipcMain.handle(IPC_CHANNELS.DIALOG_SELECT_FOLDER, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Output Folder',
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // Dialog: select file (for Brave executable)
  ipcMain.handle(IPC_CHANNELS.DIALOG_SELECT_FILE, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      title: 'Select Brave Browser Executable',
      filters: [{ name: 'Executable', extensions: ['exe'] }],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // ── Device Stats: one-time fetch ──
  ipcMain.handle(IPC_CHANNELS.DEVICE_STATS_GET, async () => {
    return getSystemStats();
  });

  // ── Device Stats: live broadcast every 2 seconds ──
  setInterval(async () => {
    try {
      const stats = await getSystemStats();
      broadcastToDashboard(IPC_CHANNELS.DEVICE_STATS_UPDATE, stats);
      // Buffer locally for server upload
      addStatSnapshot(stats);
    } catch (err) {
      console.warn('[DeviceMonitor] Failed to collect stats:', (err as Error).message);
    }
  }, 2000);

  // ── Device History: upload to server every 5 minutes ──
  setInterval(async () => {
    const pending = getPendingStats();
    if (pending.length === 0) return;

    const currentSettings = getSettings();
    if (!currentSettings.deviceId) return;

    try {
      const base = getApiBaseUrl(currentSettings);
      await axios.post(`${base}/api/device-history`, {
        deviceId: currentSettings.deviceId,
        stats: pending,
      });
      clearPendingStats();
      console.log(`[DeviceHistory] Uploaded ${pending.length} snapshots to server`);
    } catch (err) {
      console.warn('[DeviceHistory] Server upload failed:', (err as Error).message);
    }
  }, 30 * 1000);
}
