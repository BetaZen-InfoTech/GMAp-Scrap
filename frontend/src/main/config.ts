// Load .env before reading process.env
import './loadEnv';

// ============================================================
// API URLs — all values come from .env (no hardcoded fallbacks)
// ============================================================
export const LOCAL_API_URL = process.env.LOCAL_API_URL!;
export const DEV_API_URL   = process.env.DEV_API_URL!;
export const PROD_API_URL  = process.env.PROD_API_URL!;

/** App state from .env (local | dev | prod). */
export const APP_STATE = (process.env.APP_STATE || 'prod') as 'local' | 'dev' | 'prod';

/**
 * Resolve the backend API base URL based on APP_STATE from .env.
 */
export function getApiBaseUrl(): string {
  switch (APP_STATE) {
    case 'local':
      return LOCAL_API_URL;
    case 'dev':
      return DEV_API_URL;
    case 'prod':
      return PROD_API_URL;
    default:
      return PROD_API_URL;
  }
}
