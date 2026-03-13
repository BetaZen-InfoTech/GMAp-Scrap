import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { ScrapedRecord, SessionState, AppSettings, ProgressPayload, BatchSentPayload, CompletePayload } from '../shared/types';
import { ScraperEngine } from './scraperEngine';
import { sendBatch } from './batchSender';
import { generateExcel } from './excelGenerator';
import { sendExcelFile } from './apiSender';
import { getExcelDir, saveSession, loadAllPersistedSessions } from './dataStore';
import { getApiBaseUrl } from './config';

export type SessionEventType = 'progress' | 'batch-sent' | 'complete';

export interface SessionEvents {
  onProgress: (payload: ProgressPayload) => void;
  onBatchSent: (payload: BatchSentPayload) => void;
  onComplete: (payload: CompletePayload) => void;
}

export class SessionManager {
  private sessions = new Map<string, SessionState>();
  private engines = new Map<string, ScraperEngine>();
  private pendingBatch = new Map<string, ScrapedRecord[]>();
  private batchCounters = new Map<string, number>();
  private lastRecord = new Map<string, ScrapedRecord>();
  private duplicateCounts = new Map<string, number>();
  private insertedCounts = new Map<string, number>();
  /** Job context set by ScrapeJobManager so session stats include pincode/niche/round */
  private jobContext = new Map<string, {
    jobId: string;
    pincode: number;
    district: string;
    stateName: string;
    category: string;
    subCategory: string;
    round: number;
  }>();
  private events: SessionEvents;
  private settings: AppSettings;

  constructor(settings: AppSettings, events: SessionEvents, skipPersisted = false) {
    this.settings = settings;
    this.events = events;
    // Load persisted sessions from AppData on startup (skip for job-specific instances)
    if (!skipPersisted) {
      const persisted = loadAllPersistedSessions();
      for (const s of persisted) {
        this.sessions.set(s.id, s);
      }
    }
  }

  updateSettings(settings: AppSettings): void {
    this.settings = settings;
  }

  /**
   * Set job context for a session so that saveSessionStats includes
   * pincode/niche/round info in a single atomic call (no race condition).
   * Called by ScrapeJobManager before starting each session.
   */
  setJobContext(sessionId: string, ctx: {
    jobId: string;
    pincode: number;
    district: string;
    stateName: string;
    category: string;
    subCategory: string;
    round: number;
  }): void {
    this.jobContext.set(sessionId, ctx);
  }

  private validateTimingSettings(): string[] {
    const errors: string[] = [];
    const s = this.settings;
    const checks: { key: keyof AppSettings; label: string; minVal: number }[] = [
      { key: 'pageLoadTimeoutMs', label: 'Page Load Timeout', minVal: 100 },
      { key: 'pageSettleDelayMs', label: 'Page Settle Delay', minVal: 100 },
      { key: 'feedSelectorTimeoutMs', label: 'Feed Selector Timeout', minVal: 100 },
      { key: 'scrollDelayMs', label: 'Scroll Delay', minVal: 100 },
      { key: 'noNewScrollRetries', label: 'No-New-Results Retries', minVal: 1 },
      { key: 'tabPageTimeoutMs', label: 'Tab Page Timeout', minVal: 100 },
      { key: 'clickWaitTimeoutMs', label: 'Click Wait Timeout', minVal: 100 },
      { key: 'detailSettleDelayMs', label: 'Detail Settle Delay', minVal: 100 },
      { key: 'betweenClicksDelayMs', label: 'Between Clicks Delay', minVal: 100 },
    ];
    for (const { key, label, minVal } of checks) {
      const val = s[key] as number;
      if (val === undefined || val === null || isNaN(val) || val < minVal) {
        errors.push(`${label} must be at least ${minVal}`);
      }
    }
    if (!s.batchSize || s.batchSize < 1) errors.push('Batch Size must be at least 1');
    return errors;
  }

  startSession(keyword: string, browser?: 'chromium' | 'brave'): string {
    // Validate timing settings before starting
    const errors = this.validateTimingSettings();
    if (errors.length > 0) {
      throw new Error(`Incomplete settings: ${errors.join('; ')}`);
    }

    const sessionId = uuidv4();
    const settingsForSession = browser
      ? { ...this.settings, browser }
      : this.settings;

    const state: SessionState = {
      id: sessionId,
      keyword,
      status: 'running',
      totalScraped: 0,
      batchesSent: 0,
      excelSent: false,
      records: [],
      startTime: new Date().toISOString(),
    };

    this.sessions.set(sessionId, state);
    this.pendingBatch.set(sessionId, []);
    this.batchCounters.set(sessionId, 0);
    this.duplicateCounts.set(sessionId, 0);
    this.insertedCounts.set(sessionId, 0);
    saveSession(state);

    const engine = new ScraperEngine(sessionId, keyword, settingsForSession, {
      onRecord: (record) => this.handleRecord(sessionId, record),
      onStatusChange: (status, error) => this.handleStatusChange(sessionId, status, error),
      onProgress: (totalScraped) => this.handleProgress(sessionId, totalScraped),
      onScrapError: (url, name, error) => this.handleScrapError(sessionId, url, name, error),
      onUrlsCollected: (totalUrls) => this.handleUrlsCollected(sessionId, totalUrls),
    });

    this.engines.set(sessionId, engine);

    // Run in background — don't await
    engine.start().then(() => {
      this.finalizeSession(sessionId).catch((err) => {
        console.error(`[Session ${sessionId}] Finalize error:`, err);
      });
    }).catch((err) => {
      console.error(`[Session ${sessionId}] Engine error:`, err);
      const s = this.sessions.get(sessionId);
      if (s) {
        s.status = 'error';
        s.errorMessage = err instanceof Error ? err.message : String(err);
        saveSession(s);
      }
    });

    return sessionId;
  }

  async stopSession(sessionId: string): Promise<void> {
    const engine = this.engines.get(sessionId);
    const state = this.sessions.get(sessionId);
    if (state) state.status = 'stopping';
    if (engine) {
      await engine.stop();
    }
    await this.finalizeSession(sessionId);
  }

  getSession(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId);
  }

  getAllSessions(): SessionState[] {
    return Array.from(this.sessions.values()).sort(
      (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    );
  }

  private handleRecord(sessionId: string, record: ScrapedRecord): void {
    const state = this.sessions.get(sessionId);
    if (!state) return;

    state.records.push(record);
    state.totalScraped++;
    this.lastRecord.set(sessionId, record);

    const batch = this.pendingBatch.get(sessionId) ?? [];
    batch.push(record);
    this.pendingBatch.set(sessionId, batch);

    if (batch.length >= this.settings.batchSize) {
      const batchToSend = [...batch];
      this.pendingBatch.set(sessionId, []);
      const batchNum = (this.batchCounters.get(sessionId) ?? 0) + 1;
      this.batchCounters.set(sessionId, batchNum);

      const jobPincode = this.jobContext.get(sessionId)?.pincode;
      sendBatch(batchToSend, batchNum, this.settings, sessionId, state.keyword, jobPincode).then((result) => {
        if (result.success) {
          state.batchesSent++;
          // Track duplicate and inserted counts
          this.duplicateCounts.set(sessionId, (this.duplicateCounts.get(sessionId) ?? 0) + (result.duplicateCount ?? 0));
          this.insertedCounts.set(sessionId, (this.insertedCounts.get(sessionId) ?? 0) + (result.count ?? 0));
        }
        this.events.onBatchSent({
          sessionId,
          batchNumber: batchNum,
          count: result.count,
          success: result.success,
          error: result.error,
        });
      }).catch(() => {});
    }
  }

  private handleStatusChange(sessionId: string, status: import('../shared/types').SessionStatus, error?: string): void {
    const state = this.sessions.get(sessionId);
    if (!state) return;
    state.status = status;
    if (error) state.errorMessage = error;
    saveSession(state);

    this.events.onProgress({
      sessionId,
      totalScraped: state.totalScraped,
      totalUrls: state.totalUrls,
      status,
      errorMessage: error,
    });
  }

  private handleProgress(sessionId: string, totalScraped: number): void {
    const state = this.sessions.get(sessionId);
    if (!state) return;
    saveSession(state);

    this.events.onProgress({
      sessionId,
      totalScraped,
      totalUrls: state.totalUrls,
      status: state.status,
      record: this.lastRecord.get(sessionId),
    });
  }

  private handleUrlsCollected(sessionId: string, totalUrls: number): void {
    const state = this.sessions.get(sessionId);
    if (!state) return;
    state.totalUrls = totalUrls;
    saveSession(state);

    this.events.onProgress({
      sessionId,
      totalScraped: state.totalScraped,
      totalUrls,
      status: state.status,
    });
  }

  private handleScrapError(sessionId: string, url: string, name: string | undefined, error: string): void {
    const state = this.sessions.get(sessionId);
    if (!state) return;

    if (!state.scrapErrors) state.scrapErrors = [];
    state.scrapErrors.push({ url, name, error, timestamp: new Date().toISOString() });

    // Log to console so it's visible in the main process logs
    console.error(`[Scrape Error] Session ${sessionId} | ${name ?? url} | ${error}`);

    saveSession(state);
  }

  private async finalizeSession(sessionId: string): Promise<void> {
    const state = this.sessions.get(sessionId);
    if (!state) return;

    // Send any remaining records in pending batch
    const remaining = this.pendingBatch.get(sessionId) ?? [];
    if (remaining.length > 0) {
      const batchNum = (this.batchCounters.get(sessionId) ?? 0) + 1;
      this.batchCounters.set(sessionId, batchNum);
      const jobPincode = this.jobContext.get(sessionId)?.pincode;
      const result = await sendBatch(remaining, batchNum, this.settings, sessionId, state.keyword, jobPincode);
      if (result.success) {
        state.batchesSent++;
        this.duplicateCounts.set(sessionId, (this.duplicateCounts.get(sessionId) ?? 0) + (result.duplicateCount ?? 0));
        this.insertedCounts.set(sessionId, (this.insertedCounts.get(sessionId) ?? 0) + (result.count ?? 0));
      }
      this.events.onBatchSent({
        sessionId,
        batchNumber: batchNum,
        count: result.count,
        success: result.success,
        error: result.error,
      });
      this.pendingBatch.set(sessionId, []);
    }

    // Generate Excel — always saved to AppData; also copy to outputFolder if configured
    const excelResult = await generateExcel(
      sessionId,
      state.keyword,
      state.records,
      getExcelDir(),
      this.settings.outputFolder || undefined
    );

    let excelSent = false;
    let completeError: string | undefined;

    if (excelResult.success && excelResult.filePath) {
      state.excelPath = excelResult.filePath;

      const sendResult = await sendExcelFile(
        excelResult.filePath,
        sessionId,
        state.keyword,
        this.settings
      );
      excelSent = sendResult.success;
      if (!sendResult.success) completeError = sendResult.error;
    } else {
      completeError = excelResult.error;
    }

    state.excelSent = excelSent;
    if (state.status !== 'error') state.status = 'completed';
    state.endTime = new Date().toISOString();
    saveSession(state);

    // Save session statistics to backend (fire-and-forget)
    this.saveSessionStats(sessionId, state, excelSent).catch((err) => {
      console.warn(`[Session ${sessionId}] Failed to save session stats:`, err.message || err);
    });

    this.events.onComplete({
      sessionId,
      totalScraped: state.totalScraped,
      excelPath: excelResult.filePath,
      excelSent,
      error: completeError,
    });
  }

  /**
   * Save session statistics to the backend after session finalization.
   */
  private async saveSessionStats(sessionId: string, state: SessionState, excelUploaded: boolean): Promise<void> {
    const base = getApiBaseUrl();
    const duplicateRecords = this.duplicateCounts.get(sessionId) ?? 0;
    const insertedRecords = this.insertedCounts.get(sessionId) ?? 0;
    const startMs = state.startTime ? new Date(state.startTime).getTime() : Date.now();
    const endMs = state.endTime ? new Date(state.endTime).getTime() : Date.now();

    // Include job context (pincode/niche/round) if set by ScrapeJobManager
    const ctx = this.jobContext.get(sessionId);

    const payload: Record<string, unknown> = {
      sessionId,
      deviceId: this.settings.deviceId || undefined,
      keyword: state.keyword,
      totalRecords: state.totalScraped,
      insertedRecords,
      duplicateRecords,
      batchesSent: state.batchesSent,
      excelUploaded,
      status: state.status === 'completed' ? 'completed' : 'error',
      startedAt: state.startTime,
      completedAt: state.endTime,
      durationMs: endMs - startMs,
    };

    if (ctx) {
      payload.jobId = ctx.jobId;
      payload.pincode = ctx.pincode;
      payload.district = ctx.district;
      payload.stateName = ctx.stateName;
      payload.category = ctx.category;
      payload.subCategory = ctx.subCategory;
      payload.round = ctx.round;
    }

    await axios.post(`${base}/api/scraped-data/session-stats`, payload);

    // Clean up job context after saving
    this.jobContext.delete(sessionId);

    console.log(
      `[Session ${sessionId}] Stats saved: total=${state.totalScraped}, inserted=${insertedRecords}, duplicates=${duplicateRecords}${ctx ? `, pin=${ctx.pincode}, round=${ctx.round}` : ''}`
    );
  }

  async retryExcelSend(sessionId: string): Promise<void> {
    const state = this.sessions.get(sessionId);
    if (!state || !state.excelPath) return;

    const sendResult = await sendExcelFile(
      state.excelPath,
      sessionId,
      state.keyword,
      this.settings
    );

    state.excelSent = sendResult.success;
    saveSession(state);

    this.events.onComplete({
      sessionId,
      totalScraped: state.totalScraped,
      excelPath: state.excelPath,
      excelSent: sendResult.success,
      error: sendResult.error,
    });
  }
}
