import { create } from 'zustand';
import axios from 'axios';
import api, { setAuthToken } from '../lib/api';

interface AuthStore {
  isAuthenticated: boolean;
  token: string;
  loading: boolean;
  error: string;
  login: (password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
  clearSession: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  isAuthenticated: false,
  token: '',
  loading: false,
  error: '',

  login: async (password) => {
    set({ loading: true, error: '' });
    try {
      const result = await window.electronAPI.login(password);
      if (result.success && result.token) {
        setAuthToken(result.token); // set immediately — before re-render
        // Persist token from renderer side so it survives restarts
        await window.electronAPI.saveSettings({ authToken: result.token });
        set({ isAuthenticated: true, token: result.token, loading: false });
        return true;
      }
      set({ loading: false, error: result.error || 'Login failed' });
      return false;
    } catch {
      set({ loading: false, error: 'Connection failed' });
      return false;
    }
  },

  logout: async () => {
    setAuthToken('');
    try {
      await window.electronAPI.logout();
    } catch {
      // ignore errors on logout
    }
    set({ isAuthenticated: false, token: '' });
  },

  clearSession: () => {
    setAuthToken('');
    // Clear the saved token from electron-store so next restart doesn't restore invalid token
    window.electronAPI.saveSettings({ authToken: '' }).catch(() => {});
    set({ isAuthenticated: false, token: '' });
  },

  restoreSession: async () => {
    const settings = await window.electronAPI.getSettings();
    if (!settings.authToken) return;

    // Set token first, then verify it's still valid against the backend
    setAuthToken(settings.authToken);
    try {
      // Ping a lightweight protected endpoint to validate the token
      await api.get('/api/admin/devices', { timeout: 5000 });
      // Token is valid
      set({ isAuthenticated: true, token: settings.authToken });
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : null;
      if (status === 401) {
        // Backend restarted or token expired — clear stored token
        setAuthToken('');
        await window.electronAPI.saveSettings({ authToken: '' }).catch(() => {});
        // isAuthenticated stays false → will show LoginPage
      } else {
        // Network error / backend unreachable — trust local token anyway
        set({ isAuthenticated: true, token: settings.authToken });
      }
    }
  },
}));
