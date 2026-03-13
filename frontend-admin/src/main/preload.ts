import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/types';
import type { AdminSettings } from '../shared/types';

const electronAPI = {
  getSettings: (): Promise<AdminSettings> =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),

  saveSettings: (partial: Partial<AdminSettings>): Promise<AdminSettings> =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SAVE, partial),

  login: (password: string): Promise<{ success: boolean; token?: string; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGIN, password),

  logout: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGOUT),

  getApiBaseUrl: (): Promise<string> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_API_BASE_URL),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

declare global {
  interface Window {
    electronAPI: typeof electronAPI;
  }
}
