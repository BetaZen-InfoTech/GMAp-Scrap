// ============================================================
// Shared TypeScript interfaces between main & renderer
// ============================================================

export interface ScrapedRecord {
  sessionId: string;
  name: string;
  nameEnglish?: string;
  nameLocal?: string;
  address: string;
  phone: string;
  email?: string;
  website: string;
  rating: number;
  reviews: number;
  category: string;
  plusCode?: string;
  photoUrl?: string;
  latitude?: number;
  longitude?: number;
  mapsUrl: string;
  timestamp: string;
}

export type SessionStatus = 'running' | 'paused' | 'completed' | 'error' | 'stopping';

export interface ScrapError {
  url: string;
  name?: string;
  error: string;
  timestamp: string;
}

export interface SessionState {
  id: string;
  keyword: string;
  status: SessionStatus;
  totalScraped: number;
  /** Total URLs discovered in tabs-mode Phase A (undefined in feed mode) */
  totalUrls?: number;
  batchesSent: number;
  excelSent: boolean;
  excelPath?: string;
  records: ScrapedRecord[];
  scrapErrors?: ScrapError[];
  errorMessage?: string;
  startTime: string;
  endTime?: string;
}

export interface AppSettings {
  batchSize: number;
  /** 'tabs' = collect all URLs then open in parallel tabs; 'feed' = click items from the list */
  scrapingMode: 'tabs' | 'feed';
  /** Number of parallel tabs to open at once (used when scrapingMode = 'tabs') */
  parallelTabs: number;
  /** Run browser without a visible window */
  headless: boolean;
  apiEndpoint1: string;
  apiEndpoint2: string;
  apiAuthToken: string;
  /** Custom headers for Batch JSON API (Endpoint 1) */
  apiHeaders1: Record<string, string>;
  /** Custom headers for Excel Upload API (Endpoint 2) */
  apiHeaders2: Record<string, string>;
  browser: 'chromium' | 'brave' | 'edge';
  braveExecutablePath: string;
  edgeExecutablePath: string;
  outputFolder: string;

  // ── Timing settings (all in milliseconds unless noted) ──

  /** Timeout for page.goto() navigation (ms) */
  pageLoadTimeoutMs: number;
  /** Wait after page load for content to settle (ms) */
  pageSettleDelayMs: number;
  /** Timeout for waiting for the feed/place selector (ms) */
  feedSelectorTimeoutMs: number;
  /** Delay between scroll attempts while collecting URLs (ms) */
  scrollDelayMs: number;
  /** How many consecutive no-new-results scrolls before stopping (count, not ms) */
  noNewScrollRetries: number;
  /** Timeout for loading a place detail page in tabs mode (ms) */
  tabPageTimeoutMs: number;
  /** Timeout waiting for URL change after clicking a feed item (ms) */
  clickWaitTimeoutMs: number;
  /** Buffer time for detail panel fields to settle after click (ms) */
  detailSettleDelayMs: number;
  /** Delay between processing each feed item in feed mode (ms) */
  betweenClicksDelayMs: number;

  // ── Backend API environment ──
  /** API environment driven by APP_STATE from .env */
  apiEnvironment: 'local' | 'dev' | 'prod';
  /** Production backend base URL (e.g. https://api.example.com) */
  prodApiUrl: string;

  // ── Device registration ──
  isRegistered: boolean;
  deviceId: string;
  nickname: string;

  // ── App passcode (local lock) ──
  /** Optional passcode required on app launch. Empty string = no passcode */
  passcode: string;
}

// ============================================================
// API Log Entry
// ============================================================

export interface ApiLogEntry {
  timestamp: string;
  type: 'batch' | 'excel';
  sessionId: string;
  keyword?: string;
  endpoint: string;
  attempt: number;
  statusCode?: number;
  responseTimeMs: number;
  success: boolean;
  error?: string;
  recordCount?: number;
}

// ============================================================
// IPC Channel Payloads
// ============================================================

export interface StartScrapePayload {
  keyword: string;
  browser?: 'chromium' | 'brave' | 'edge';
}

export interface StopScrapePayload {
  sessionId: string;
}

export interface ProgressPayload {
  sessionId: string;
  record?: ScrapedRecord;
  totalScraped: number;
  /** Set once tabs-mode Phase A (URL collection) is complete */
  totalUrls?: number;
  status: SessionStatus;
  errorMessage?: string;
}

export interface BatchSentPayload {
  sessionId: string;
  batchNumber: number;
  count: number;
  success: boolean;
  error?: string;
}

export interface CompletePayload {
  sessionId: string;
  totalScraped: number;
  excelPath?: string;
  excelSent: boolean;
  error?: string;
}

export interface SaveSettingsPayload {
  settings: Partial<AppSettings>;
}

// ============================================================
// Scrape Job (Pincode-Range Automated Scraping)
// ============================================================

export interface PincodeInfo {
  Pincode: number;
  District: string;
  StateName: string;
}

export interface NicheInfo {
  Category: string;
  SubCategory: string;
}

export type ScrapeJobStatus = 'idle' | 'loading' | 'running' | 'paused' | 'completed' | 'stopped';

export interface ScrapeJobState {
  jobId: string;
  deviceId: string;
  startPincode: number;
  endPincode: number;
  pincodes: PincodeInfo[];
  niches: NicheInfo[];
  pincodeIndex: number;    // 0-based
  nicheIndex: number;      // 0-based
  round: number;           // 1, 2, or 3
  totalSearches: number;
  completedSearches: number;
  status: ScrapeJobStatus;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// Device Stats (live system monitoring)
// ============================================================

export interface DeviceStats {
  timestamp: string;
  cpuUsedPercent: number;
  ramTotalMB: number;
  ramUsedMB: number;
  ramUsedPercent: number;
  diskTotalGB: number;
  diskUsedGB: number;
  diskUsedPercent: number;
  networkSentMB: number;
  networkRecvMB: number;
}

// ============================================================
// IPC Channel Names (type-safe constants)
// ============================================================

export const IPC_CHANNELS = {
  SCRAPER_START: 'scraper:start',
  SCRAPER_STOP: 'scraper:stop',
  SCRAPER_PROGRESS: 'scraper:progress',
  SCRAPER_BATCH_SENT: 'scraper:batch-sent',
  SCRAPER_COMPLETE: 'scraper:complete',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SAVE: 'settings:save',
  DIALOG_SELECT_FOLDER: 'dialog:select-folder',
  DIALOG_SELECT_FILE: 'dialog:select-file',
  EXCEL_RETRY_SEND: 'excel:retry-send',
  WINDOW_OPEN_POPUP: 'window:open-popup',
  DATA_DOWNLOAD_EXCEL: 'data:download-excel',
  DATA_OPEN_EXCEL_FOLDER: 'data:open-excel-folder',
  API_LOGS_GET: 'api-logs:get',
  API_LOGS_CLEAR: 'api-logs:clear',
  DEVICE_REGISTER: 'device:register',
  DEVICE_VERIFY: 'device:verify',
  SCRAPE_JOB_LOAD: 'scrape-job:load',
  SCRAPE_JOB_START: 'scrape-job:start',
  SCRAPE_JOB_PAUSE: 'scrape-job:pause',
  SCRAPE_JOB_STOP: 'scrape-job:stop',
  SCRAPE_JOB_STATE: 'scrape-job:state',
  SCRAPE_JOBS_STATE: 'scrape-job:all-states',
  SCRAPE_JOB_PROGRESS: 'scrape-job:progress',
  DEVICE_STATS_GET: 'device:stats-get',
  DEVICE_STATS_UPDATE: 'device:stats-update',
  GET_API_BASE_URL: 'config:get-api-base-url',
} as const;

export type IpcChannelName = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];

// ============================================================
// Window types
// ============================================================

export type WindowType = 'dashboard' | 'popup';

export interface WindowInfo {
  windowId: number;
  type: WindowType;
  sessionId?: string;
}
