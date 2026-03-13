import Store from 'electron-store';
import { AppSettings } from '../shared/types';

const DEFAULT_SETTINGS: AppSettings = {
  batchSize: 10,
  scrapingMode: 'tabs',
  parallelTabs: 5,
  apiEndpoint1: '',
  apiEndpoint2: '',
  apiAuthToken: '',
  apiHeaders1: {},
  apiHeaders2: {},
  headless: false,
  browser: 'chromium',
  braveExecutablePath: '',
  edgeExecutablePath: '',
  outputFolder: '',

  // Timing defaults
  pageLoadTimeoutMs: 120000,
  pageSettleDelayMs: 5000,
  feedSelectorTimeoutMs: 60000,
  scrollDelayMs: 2000,
  noNewScrollRetries: 5,
  tabPageTimeoutMs: 30000,
  clickWaitTimeoutMs: 8000,
  detailSettleDelayMs: 300,
  betweenClicksDelayMs: 100,

  // Backend API environment — driven by APP_STATE in .env
  apiEnvironment: (process.env.APP_STATE as 'local' | 'dev' | 'prod') || 'prod',
  prodApiUrl: process.env.PROD_API_URL || 'https://gmap-scrap-backend-api.betazeninfotech.com',

  // Device registration
  isRegistered: false,
  deviceId: '',
  nickname: '',

  // App passcode (empty = no passcode)
  passcode: '',
};

interface StoreSchema {
  settings: AppSettings;
}

const store = new Store<StoreSchema>({
  defaults: {
    settings: DEFAULT_SETTINGS,
  },
});

export function getSettings(): AppSettings {
  const stored = store.get('settings') as AppSettings;
  return { ...DEFAULT_SETTINGS, ...stored };
}

export function saveSettings(partial: Partial<AppSettings>): AppSettings {
  const current = getSettings();
  const updated = { ...current, ...partial };
  store.set('settings', updated);
  return updated;
}
