import { AppSettings } from '../shared/types';

// ============================================================
// API URLs — read from .env, fall back to hardcoded defaults
// local → your machine, local backend      (http://127.0.0.1:5000)
// dev   → your machine, remote backend     (http://127.0.0.1:5000)
// prod  → deployed remote server           (https://gmap-scrap-backend-api.betazeninfotech.com)
// ============================================================
export const LOCAL_API_URL = process.env.LOCAL_API_URL || 'http://127.0.0.1:5000';
export const DEV_API_URL   = process.env.DEV_API_URL   || 'http://127.0.0.1:5000';
export const PROD_API_URL  = process.env.PROD_API_URL  || 'https://gmap-scrap-backend-api.betazeninfotech.com';

/** App state from .env (local | dev | prod). Defaults to 'prod'. */
export const APP_STATE = (process.env.APP_STATE || 'prod') as 'local' | 'dev' | 'prod';

/**
 * Resolve the backend API base URL.
 * Priority: settings.apiEnvironment > APP_STATE from .env
 */
export function getApiBaseUrl(settings: AppSettings): string {
  const env = settings.apiEnvironment || APP_STATE;
  switch (env) {
    case 'local':
      return LOCAL_API_URL;
    case 'dev':
      return DEV_API_URL;
    case 'prod':
      return settings.prodApiUrl || PROD_API_URL;
    default:
      return PROD_API_URL;
  }
}
