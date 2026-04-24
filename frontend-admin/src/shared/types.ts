// ============================================================
// Admin Dashboard — Shared Types
// ============================================================

// --- Device ---
export interface JobProgress {
  jobId: string;
  startPincode: number;
  endPincode: number;
  totalPincodes: number;
  currentPincode: number;
  currentPincodeIndex: number;
  status: 'running' | 'paused' | 'completed' | 'stopped' | 'stop';
  completedSearches: number;
  totalSearches: number;
  percent: number;
  completedAt: string | null;
}

export interface TaskProgress {
  status: 'running' | 'paused' | 'completed' | 'stopped' | 'stop';
  completedSearches: number;
  totalSearches: number;
  percent: number;
  completedAt: string | null;
  jobs?: JobProgress[]; // Only present for 'jobs' type tasks
}

export interface ScrapeTask {
  type: 'jobs' | 'range' | 'single';
  startPin: string;
  endPin?: string;
  jobs?: number;
  progress?: TaskProgress | null;
}

export interface DeviceInfo {
  _id: string;
  deviceId: string;
  nickname?: string;
  hostname: string;
  ip?: string;
  username: string;
  platform: string;
  osVersion: string;
  arch: string;
  cpuModel: string;
  cpuCores: number;
  totalMemoryGB: number;
  isActive: boolean;
  isArchived?: boolean;
  archivedAt?: string;
  vpsPassword?: string;
  scrapePincode?: string;
  scrapeJobs?: number;
  scrapeTasks?: ScrapeTask[];
  status?: 'online' | 'offline';
  lastSeenAt: string;
  createdAt: string;
  latestStats?: StatSnapshot;
  activeJobs?: number;
  totalSessions?: number;
  recent?: {
    records: { total: number; avg10min: number; buckets: number[] };
    sessions: { total: number; totalRecords: number; avg10min: number; buckets: number[] };
  };
}

export interface StatSnapshot {
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

export interface DeviceHistoryDay {
  deviceId: string;
  date: string;
  stats: StatSnapshot[];
}

// --- Session Stats ---
export interface SessionStatsRecord {
  _id: string;
  sessionId: string;
  jobId?: string;
  deviceId?: string;
  keyword?: string;
  pincode?: number;
  district?: string;
  stateName?: string;
  category?: string;
  subCategory?: string;
  round?: number;
  totalRecords: number;
  insertedRecords: number;
  duplicateRecords: number;
  batchesSent: number;
  excelUploaded: boolean;
  deviceName?: string;
  status: 'completed' | 'error' | 'partial';
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  createdAt: string;
}

// --- Scrape Tracking (Jobs) ---
export interface ScrapeJob {
  _id: string;
  jobId: string;
  deviceId: string;
  deviceName?: string;
  startPincode: number;
  endPincode: number;
  pincodeIndex: number;
  nicheIndex: number;
  round: number;
  totalSearches: number;
  completedSearches: number;
  status: 'running' | 'paused' | 'completed' | 'stopped' | 'stop';
  createdAt: string;
  updatedAt: string;
}

// --- Analytics ---
export interface AnalyticsData {
  totalRecords: number;
  duplicateRecords: number;
  duplicateRate: number;
  activeDevices: number;
  inactiveDevices: number;
  recordsPerDevice: Array<{ deviceId: string; hostname: string; count: number }>;
  topPincodes: Array<{ pincode: string; count: number }>;
  topCategories: Array<{ category: string; count: number }>;
  sessionCompletionRate: number;
  avgSessionDurationMs: number;
  jobsInProgress: number;
  jobsCompleted: number;
  pincodesCovered: number;
}

// --- PinCode (from PinCode-Dataset) ---
export interface PinCodeRecord {
  _id: string;
  CircleName: string;
  Pincode: number;
  District: string;
  StateName: string;
  Latitude: string;
  Longitude: string;
  Country: string;
  scrapedCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

/** Fields accepted by POST /api/admin/pincodes and PATCH /api/admin/pincodes/:id. */
export interface PinCodeInput {
  Pincode: number | string;
  CircleName?: string;
  District?: string;
  StateName?: string;
  Latitude?: string;
  Longitude?: string;
  Country?: string;
}

// --- Scraped Pincode (aggregated) ---
export interface ScrapedPincodeRecord {
  pincode: string;
  district: string;
  stateName: string;
  circleName: string;
  totalRecords: number;
  categories: string[];
  subCategories: string[];
  rounds: number[];
  devices: string[];
  completionStatus?: 'running' | 'completed' | 'stop';
  completedRounds?: number[];
}

// --- Scraped Data Record (full) ---
export interface ScrapedDataRecord {
  _id: string;
  sessionId: string;
  deviceId?: string;
  batchNumber?: number;
  name?: string;
  nameEnglish?: string;
  nameLocal?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  rating?: number;
  reviews?: number;
  category?: string;
  pincode?: string;
  plusCode?: string;
  photoUrl?: string;
  latitude?: number;
  longitude?: number;
  mapsUrl?: string;
  scrapKeyword?: string;
  scrapCategory?: string;
  scrapSubCategory?: string;
  scrapRound?: number;
  scrapedAt?: string;
  isDuplicate?: boolean;
  scrapFrom?: string;
  scrapWebsite?: boolean;
  numberFixing?: boolean;
  createdAt?: string;
}

// --- Auth ---
export interface AdminSettings {
  /** API environment driven by APP_STATE from .env */
  apiEnvironment: 'local' | 'dev' | 'prod';
  prodApiUrl: string;
  authToken: string;
}

// --- Live WebSocket Events ---
export interface LiveStatEvent {
  deviceId: string;
  date: string;
  stat: StatSnapshot;
  totalSnapshots: number;
}

// --- Paginated Response ---
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

// --- IPC Channels ---
export const IPC_CHANNELS = {
  SETTINGS_GET: 'admin:settings-get',
  SETTINGS_SAVE: 'admin:settings-save',
  AUTH_LOGIN: 'admin:auth-login',
  AUTH_LOGOUT: 'admin:auth-logout',
  GET_API_BASE_URL: 'admin:get-api-base-url',
  SCRAPE_WEBSITE: 'admin:scrape-website',
  SSH_CONNECT: 'ssh:connect',
  SSH_COMMAND: 'ssh:command',
  SSH_COMMAND_ALL: 'ssh:command-all',
  SSH_DISCONNECT: 'ssh:disconnect',
  SSH_OUTPUT: 'ssh:output',
  SSH_ERROR: 'ssh:error',
  SSH_STATUS: 'ssh:status',
} as const;
