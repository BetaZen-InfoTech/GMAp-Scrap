import Store from 'electron-store';
import { AdminSettings } from '../shared/types';

const DEFAULT_SETTINGS: AdminSettings = {
  // Backend API environment — driven by APP_STATE in .env
  apiEnvironment: (process.env.APP_STATE as 'local' | 'dev' | 'prod') || 'prod',
  prodApiUrl: process.env.PROD_API_URL || 'https://gmap-scrap-backend-api.betazeninfotech.com',
  authToken: '',
};

interface StoreSchema {
  settings: AdminSettings;
}

const store = new Store<StoreSchema>({
  defaults: {
    settings: DEFAULT_SETTINGS,
  },
});

export function getSettings(): AdminSettings {
  const stored = store.get('settings') as AdminSettings;
  return { ...DEFAULT_SETTINGS, ...stored };
}

export function saveSettings(partial: Partial<AdminSettings>): AdminSettings {
  const current = getSettings();
  const updated = { ...current, ...partial };
  store.set('settings', updated);
  return updated;
}
