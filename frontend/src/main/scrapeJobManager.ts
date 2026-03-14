import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { ScrapeJobState, PincodeInfo, NicheInfo, AppSettings, SessionState } from '../shared/types';
import { SessionManager, SessionEvents } from './sessionManager';
import { getSettings } from './store';
import { getApiBaseUrl } from './config';
import { getAllScrapeJobs, saveScrapeJob, clearScrapeJob } from './scrapeJobStore';

/** Per-job entry holding state, dedicated SessionManager, and control flags */
interface JobEntry {
  job: ScrapeJobState;
  sessionManager: SessionManager;
  pauseRequested: boolean;
  stopRequested: boolean;
  running: boolean;
}

export class ScrapeJobManager {
  private jobs = new Map<string, JobEntry>();
  private onProgress: (job: ScrapeJobState) => void;
  private settings: AppSettings;
  private sessionEvents: SessionEvents;

  /** Global cache of already-completed searches (shared across all jobs) */
  private completedSet = new Set<string>();

  constructor(
    settings: AppSettings,
    sessionEvents: SessionEvents,
    onProgress: (job: ScrapeJobState) => void,
  ) {
    this.settings = settings;
    this.sessionEvents = sessionEvents;
    this.onProgress = onProgress;

    // Rehydrate all stored jobs on startup
    const stored = getAllScrapeJobs();
    for (const jobState of Object.values(stored)) {
      if (jobState.status !== 'completed' && jobState.status !== 'stopped') {
        const entry: JobEntry = {
          job: { ...jobState, status: 'paused' },
          sessionManager: new SessionManager(this.settings, this.sessionEvents, true),
          pauseRequested: false,
          stopRequested: false,
          running: false,
        };
        this.jobs.set(jobState.jobId, entry);
      }
    }
  }

  updateSettings(settings: AppSettings): void {
    this.settings = settings;
    for (const entry of this.jobs.values()) {
      entry.sessionManager.updateSettings(settings);
    }
  }

  getState(jobId: string): ScrapeJobState | null {
    return this.jobs.get(jobId)?.job ?? null;
  }

  getAllStates(): ScrapeJobState[] {
    return Array.from(this.jobs.values()).map((e) => e.job);
  }

  /**
   * Get all sessions from all job-specific SessionManagers (for merging with main sessions).
   */
  getAllJobSessions(): SessionState[] {
    const allSessions: SessionState[] = [];
    for (const entry of this.jobs.values()) {
      allSessions.push(...entry.sessionManager.getAllSessions());
    }
    return allSessions;
  }

  /**
   * Find a single session by ID across all job-specific SessionManagers.
   */
  getSessionById(sessionId: string): SessionState | null {
    for (const entry of this.jobs.values()) {
      const session = entry.sessionManager.getSession(sessionId);
      if (session) return session;
    }
    return null;
  }

  /**
   * Load a new job — always creates a fresh job with its own SessionManager.
   */
  async load(startPincode: number, endPincode: number, deviceId: string): Promise<ScrapeJobState> {
    const settings = getSettings();
    const base = getApiBaseUrl();

    // Fetch pincodes in range
    const pincodeRes = await axios.get<PincodeInfo[]>(
      `${base}/api/pincodes/range?start=${startPincode}&end=${endPincode}`,
    );
    const pincodes = pincodeRes.data;
    if (!pincodes.length) {
      throw new Error(`No pincodes found in range ${startPincode}–${endPincode}`);
    }

    // Fetch all niches
    const nicheRes = await axios.get<NicheInfo[]>(`${base}/api/niches`);
    const niches = nicheRes.data;
    if (!niches.length) {
      throw new Error('No niches found in the database');
    }

    const jobId = uuidv4();
    const totalSearches = pincodes.length * niches.length * 3;
    const now = new Date().toISOString();

    // Create tracking doc in backend (fire-and-forget)
    try {
      await axios.post(`${base}/api/scrape-tracking`, {
        jobId,
        deviceId,
        startPincode,
        endPincode,
        totalSearches,
      });
    } catch (err) {
      console.warn('[ScrapeJobManager] Could not create tracking doc:', (err as Error).message);
    }

    const job: ScrapeJobState = {
      jobId,
      deviceId,
      startPincode,
      endPincode,
      pincodes,
      niches,
      pincodeIndex: 0,
      nicheIndex: 0,
      round: 1,
      totalSearches,
      completedSearches: 0,
      status: 'paused',
      createdAt: now,
      updatedAt: now,
    };

    // Create dedicated SessionManager for this job (skipPersisted = true)
    const sessionManager = new SessionManager(this.settings, this.sessionEvents, true);

    const entry: JobEntry = {
      job,
      sessionManager,
      pauseRequested: false,
      stopRequested: false,
      running: false,
    };

    this.jobs.set(jobId, entry);
    saveScrapeJob(job);
    return job;
  }

  /**
   * Start or resume a specific job's loop.
   */
  async start(jobId: string): Promise<void> {
    const entry = this.jobs.get(jobId);
    if (!entry) throw new Error(`No job found with id ${jobId}`);
    if (entry.running) return;
    if (entry.job.status === 'completed' || entry.job.status === 'stopped') {
      throw new Error('Job is already finished');
    }

    // Fetch completed searches from backend before starting
    await this.loadCompletedSearches(entry.job.jobId);

    entry.pauseRequested = false;
    entry.stopRequested = false;
    entry.running = true;
    entry.job.status = 'running';
    entry.job.updatedAt = new Date().toISOString();
    saveScrapeJob(entry.job);
    this.onProgress(entry.job);

    try {
      await this.runLoop(jobId);
    } finally {
      entry.running = false;
    }
  }

  /**
   * Pause a specific job — immediately updates status, loop exits gracefully.
   */
  pause(jobId: string): void {
    const entry = this.jobs.get(jobId);
    if (!entry) return;
    entry.pauseRequested = true;
    if (entry.job.status === 'running') {
      entry.job.status = 'paused';
      entry.job.updatedAt = new Date().toISOString();
      saveScrapeJob(entry.job);
      this.onProgress(entry.job);
    }
  }

  /**
   * Stop a specific job and remove it.
   */
  stop(jobId: string): void {
    const entry = this.jobs.get(jobId);
    if (!entry) return;
    entry.stopRequested = true;
    entry.pauseRequested = true;
    entry.job.status = 'stopped';
    entry.job.updatedAt = new Date().toISOString();
    this.onProgress(entry.job);
    clearScrapeJob(jobId);
    this.jobs.delete(jobId);
  }

  /**
   * Fetch completed searches for a job from Session-Stats and populate global cache.
   */
  private async loadCompletedSearches(jobId: string): Promise<void> {
    try {
      const settings = getSettings();
      const base = getApiBaseUrl();
      const res = await axios.get<Array<{ keyword: string; pincode: number; category: string; subCategory: string; round: number }>>(
        `${base}/api/scraped-data/session-stats/completed/${jobId}`,
      );
      for (const item of res.data) {
        if (item.keyword && item.round != null) {
          this.completedSet.add(`${item.keyword}|R${item.round}`);
        }
      }
      console.log(`[ScrapeJobManager] Loaded ${res.data.length} completed searches for job ${jobId}`);
    } catch (err) {
      console.warn('[ScrapeJobManager] Could not load completed searches:', (err as Error).message);
    }
  }

  /**
   * Check if a search is already completed by keyword.
   * Checks local cache first, then LIVE database query.
   */
  private async isSearchCompleted(keyword: string, round: number): Promise<boolean> {
    const cacheKey = `${keyword}|R${round}`;
    if (this.completedSet.has(cacheKey)) {
      return true;
    }

    try {
      const base = getApiBaseUrl();
      const res = await axios.get<{ completed: boolean }>(
        `${base}/api/scraped-data/session-stats/check-completed`,
        { params: { keyword, round } },
      );
      if (res.data.completed) {
        this.completedSet.add(cacheKey);
        return true;
      }
      return false;
    } catch (err) {
      console.warn('[ScrapeJobManager] Live completion check failed:', (err as Error).message);
      return false;
    }
  }

  /**
   * Save session stats with keyword (AWAITED) — must complete before position advances.
   */
  private async saveSessionStatsDirectly(
    sessionId: string,
    keyword: string,
    job: ScrapeJobState,
    pinInfo: PincodeInfo,
    niche: NicheInfo,
    round: number,
  ): Promise<void> {
    try {
      const settings = getSettings();
      const base = getApiBaseUrl();
      await axios.post(`${base}/api/scraped-data/session-stats`, {
        sessionId,
        keyword,
        jobId: job.jobId,
        deviceId: job.deviceId,
        pincode: pinInfo.Pincode,
        district: pinInfo.District,
        stateName: pinInfo.StateName,
        category: niche.Category,
        subCategory: niche.SubCategory,
        round,
        status: 'completed',
      });
      console.log(`[ScrapeJobManager] Session stats saved: ${keyword}`);
    } catch (err) {
      console.warn('[ScrapeJobManager] Failed to save session stats:', (err as Error).message);
    }
  }

  /**
   * Mark a search as completed in local cache + Scrape-Tracking (fire-and-forget).
   */
  private markSearchCompleted(
    keyword: string,
    job: ScrapeJobState,
    pinInfo: PincodeInfo,
    niche: NicheInfo,
    round: number,
    sessionId: string,
  ): void {
    this.completedSet.add(`${keyword}|R${round}`);

    const settings = getSettings();
    const base = getApiBaseUrl();
    axios
      .post(`${base}/api/scrape-tracking/${job.jobId}/search-complete`, {
        deviceId: job.deviceId,
        pincode: pinInfo.Pincode,
        district: pinInfo.District,
        stateName: pinInfo.StateName,
        category: niche.Category,
        subCategory: niche.SubCategory,
        round,
        sessionId,
      })
      .catch((err) => {
        console.warn('[ScrapeJobManager] Failed to mark search complete:', (err as Error).message);
      });
  }

  private async runLoop(jobId: string): Promise<void> {
    const entry = this.jobs.get(jobId);
    if (!entry) return;
    const { job, sessionManager } = entry;

    while (!entry.pauseRequested && !entry.stopRequested) {
      // Check if done
      if (job.pincodeIndex >= job.pincodes.length) {
        job.status = 'completed';
        job.updatedAt = new Date().toISOString();
        saveScrapeJob(job);
        this.patchTracking(job);
        this.onProgress(job);
        return;
      }

      const pinInfo = job.pincodes[job.pincodeIndex];
      const niche = job.niches[job.nicheIndex];

      const searchText = `get all ${niche.SubCategory} (${niche.Category}) from ${pinInfo.District}, ${pinInfo.StateName}, Pin - ${pinInfo.Pincode}`;

      // Check if already completed → skip
      const alreadyCompleted = await this.isSearchCompleted(searchText, job.round);
      if (alreadyCompleted) {
        console.log(`[ScrapeJobManager][${jobId.slice(0, 8)}] Skipping (already completed): ${searchText}`);
        job.completedSearches++;
        this.advancePosition(job);
        job.updatedAt = new Date().toISOString();
        saveScrapeJob(job);
        this.onProgress(job);
        continue;
      }

      // Start the scrape session using this job's dedicated SessionManager
      let sessionId: string;
      try {
        sessionId = sessionManager.startSession(searchText);
      } catch (err) {
        console.error(`[ScrapeJobManager][${jobId.slice(0, 8)}] Failed to start session:`, (err as Error).message);
        entry.pauseRequested = true;
        break;
      }

      // Set job context so saveSessionStats includes pincode/niche/round
      sessionManager.setJobContext(sessionId, {
        jobId: job.jobId,
        pincode: pinInfo.Pincode,
        district: pinInfo.District,
        stateName: pinInfo.StateName,
        category: niche.Category,
        subCategory: niche.SubCategory,
        round: job.round,
      });

      // Wait for session to complete
      await this.waitForSession(entry, sessionId);

      if (entry.stopRequested) break;
      if (entry.pauseRequested) break;

      // Check session outcome
      const session = sessionManager.getSession(sessionId);
      const sessionCompleted = session?.status === 'completed';

      if (sessionCompleted) {
        await this.saveSessionStatsDirectly(sessionId, searchText, job, pinInfo, niche, job.round);
        this.markSearchCompleted(searchText, job, pinInfo, niche, job.round, sessionId);
      }

      job.completedSearches++;
      this.advancePosition(job);

      job.updatedAt = new Date().toISOString();
      saveScrapeJob(job);
      this.patchTracking(job);
      this.onProgress(job);
    }

    // Paused
    if (!entry.stopRequested && job.status !== 'completed') {
      job.status = 'paused';
      job.updatedAt = new Date().toISOString();
      saveScrapeJob(job);
      this.patchTracking(job);
      this.onProgress(job);
    }
  }

  /**
   * Advance pincodeIndex / nicheIndex / round to the next search position.
   */
  private advancePosition(job: ScrapeJobState): void {
    job.nicheIndex++;
    if (job.nicheIndex >= job.niches.length) {
      job.nicheIndex = 0;
      job.round++;
      if (job.round > 3) {
        job.round = 1;
        job.pincodeIndex++;
      }
    }
  }

  private waitForSession(entry: JobEntry, sessionId: string): Promise<void> {
    const MAX_WAIT_MS = 20 * 60 * 1000;
    return new Promise((resolve) => {
      const started = Date.now();
      const poll = setInterval(() => {
        if (entry.stopRequested || entry.pauseRequested) {
          clearInterval(poll);
          resolve();
          return;
        }
        if (Date.now() - started > MAX_WAIT_MS) {
          clearInterval(poll);
          console.warn(`[ScrapeJobManager] waitForSession timeout for ${sessionId}`);
          resolve();
          return;
        }
        const session = entry.sessionManager.getSession(sessionId);
        if (!session) {
          clearInterval(poll);
          resolve();
          return;
        }
        if (session.status === 'completed' || session.status === 'error') {
          clearInterval(poll);
          resolve();
        }
      }, 500);
    });
  }

  private patchTracking(job: ScrapeJobState): void {
    const settings = getSettings();
    const base = getApiBaseUrl();
    axios
      .patch(`${base}/api/scrape-tracking/${job.jobId}`, {
        pincodeIndex: job.pincodeIndex,
        nicheIndex: job.nicheIndex,
        round: job.round,
        completedSearches: job.completedSearches,
        status: job.status === 'running' ? 'running'
          : job.status === 'paused' ? 'paused'
          : job.status === 'completed' ? 'completed'
          : 'stopped',
      })
      .catch((err) => {
        console.warn('[ScrapeJobManager] Tracking patch failed:', (err as Error).message);
      });
  }
}
