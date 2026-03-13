import Store from 'electron-store';
import { AdminSettings } from '../shared/types';
import { APP_STATE, PROD_API_URL } from './config';

const DEFAULT_SETTINGS: AdminSettings = {
  apiEnvironment: APP_STATE,
  prodApiUrl: PROD_API_URL,
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
  // Always use APP_STATE from config (not stale persisted value)
  return { ...DEFAULT_SETTINGS, ...stored, apiEnvironment: APP_STATE };
}

export function saveSettings(partial: Partial<AdminSettings>): AdminSettings {
  const current = getSettings();
  const updated = { ...current, ...partial };
  store.set('settings', updated);
  return updated;
}
