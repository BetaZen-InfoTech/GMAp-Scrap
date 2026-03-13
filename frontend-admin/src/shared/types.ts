// ============================================================
// Admin Dashboard — Shared Types
// ============================================================

// --- Device ---
export interface DeviceInfo {
  _id: string;
  deviceId: string;
  nickname?: string;
  hostname: string;
  username: string;
  platform: string;
  osVersion: string;
  arch: string;
  cpuModel: string;
  cpuCores: number;
  totalMemoryGB: number;
  isActive: boolean;
  lastSeenAt: string;
  createdAt: string;
  latestStats?: StatSnapshot;
  activeJobs?: number;
  totalSessions?: number;
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
  startPincode: number;
  endPincode: number;
  pincodeIndex: number;
  nicheIndex: number;
  round: number;
  totalSearches: number;
  completedSearches: number;
  status: 'running' | 'paused' | 'completed' | 'stopped';
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

// --- Auth ---
export interface AdminSettings {
  /** 'local' = 127.0.0.1:5000 | 'dev' = 127.0.0.1:5000 | 'prod' = prodApiUrl */
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
} as const;
