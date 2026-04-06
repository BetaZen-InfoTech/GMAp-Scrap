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

  scrapeWebsite: (url: string, headless: boolean): Promise<{ success: boolean; phones: string[]; emails: string[]; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.SCRAPE_WEBSITE, url, headless),

  // SSH
  sshConnect: (deviceId: string, host: string, port: number, username: string, password: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.SSH_CONNECT, deviceId, host, port, username, password),

  sshCommand: (deviceId: string, command: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.SSH_COMMAND, deviceId, command),

  sshCommandAll: (command: string): Promise<{ success: boolean; count: number }> =>
    ipcRenderer.invoke(IPC_CHANNELS.SSH_COMMAND_ALL, command),

  sshDisconnect: (deviceId?: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.SSH_DISCONNECT, deviceId),

  onSshOutput: (callback: (deviceId: string, data: string) => void) => {
    const handler = (_: unknown, deviceId: string, data: string) => callback(deviceId, data);
    ipcRenderer.on(IPC_CHANNELS.SSH_OUTPUT, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SSH_OUTPUT, handler);
  },

  onSshError: (callback: (deviceId: string, error: string) => void) => {
    const handler = (_: unknown, deviceId: string, error: string) => callback(deviceId, error);
    ipcRenderer.on(IPC_CHANNELS.SSH_ERROR, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SSH_ERROR, handler);
  },

  onSshStatus: (callback: (deviceId: string, status: string) => void) => {
    const handler = (_: unknown, deviceId: string, status: string) => callback(deviceId, status);
    ipcRenderer.on(IPC_CHANNELS.SSH_STATUS, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SSH_STATUS, handler);
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

declare global {
  interface Window {
    electronAPI: typeof electronAPI;
  }
}
