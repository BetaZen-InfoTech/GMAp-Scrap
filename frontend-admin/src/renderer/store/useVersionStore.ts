import { create } from 'zustand';
import api from '../lib/api';

// @ts-ignore — Vite injects this from package.json
const ADMIN_VERSION: string = __APP_VERSION__ || '0.0.0';

interface VersionState {
  adminVersion: string;
  backendVersion: string | null;
  backendError: string | null;
  lastChecked: number;

  fetchBackendVersion: () => Promise<void>;
  isMismatch: () => boolean;
}

export const useVersionStore = create<VersionState>((set, get) => ({
  adminVersion: ADMIN_VERSION,
  backendVersion: null,
  backendError: null,
  lastChecked: 0,

  fetchBackendVersion: async () => {
    try {
      const res = await api.get('/api/version', { timeout: 5000 });
      set({
        backendVersion: res.data?.version || 'unknown',
        backendError: null,
        lastChecked: Date.now(),
      });
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || 'Connection failed';
      set({
        backendVersion: null,
        backendError: msg,
        lastChecked: Date.now(),
      });
    }
  },

  isMismatch: () => {
    const { adminVersion, backendVersion } = get();
    if (!backendVersion) return false;
    // Compare major.minor only (patch can differ)
    const adminMM = adminVersion.split('.').slice(0, 2).join('.');
    const backendMM = backendVersion.split('.').slice(0, 2).join('.');
    return adminMM !== backendMM;
  },
}));
