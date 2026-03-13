import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../shared/types';
import { getSettings, saveSettings } from './store';
import axios from 'axios';
import { getApiBaseUrl } from './config';

export function setupIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async () => getSettings());

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SAVE, async (_, partial) => {
    return saveSettings(partial);
  });

  // Return the resolved API base URL to the renderer
  ipcMain.handle(IPC_CHANNELS.GET_API_BASE_URL, async () => getApiBaseUrl());

  ipcMain.handle(IPC_CHANNELS.AUTH_LOGIN, async (_, password: string) => {
    const base = getApiBaseUrl();
    try {
      const res = await axios.post(`${base}/api/admin/login`, { password }, { timeout: 10000 });
      if (res.data.success) {
        saveSettings({ authToken: res.data.token });
        return { success: true, token: res.data.token };
      }
      return { success: false, error: res.data.error || 'Login failed' };
    } catch (err: unknown) {
      const axErr = axios.isAxiosError(err) ? err : null;
      return {
        success: false,
        error: axErr?.response?.data?.error || (err instanceof Error ? err.message : 'Connection failed'),
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.AUTH_LOGOUT, async () => {
    saveSettings({ authToken: '' });
    return { success: true };
  });
}
