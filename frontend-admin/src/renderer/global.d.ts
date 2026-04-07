import type { AdminSettings } from '../shared/types';

declare global {
  interface Window {
    electronAPI: {
      getSettings: () => Promise<AdminSettings>;
      saveSettings: (partial: Partial<AdminSettings>) => Promise<AdminSettings>;
      login: (password: string) => Promise<{ success: boolean; token?: string; error?: string }>;
      logout: () => Promise<{ success: boolean }>;
      getApiBaseUrl: () => Promise<string>;
      scrapeWebsite: (url: string, headless: boolean) => Promise<{ success: boolean; phones: string[]; emails: string[]; error?: string }>;
      // SSH
      sshConnect: (deviceId: string, host: string, port: number, username: string, password: string) => Promise<{ success: boolean; error?: string }>;
      sshCommand: (deviceId: string, command: string, raw?: boolean) => Promise<{ success: boolean }>;
      sshCommandAll: (command: string) => Promise<{ success: boolean; count: number }>;
      sshDisconnect: (deviceId?: string) => Promise<{ success: boolean }>;
      onSshOutput: (callback: (deviceId: string, data: string) => void) => () => void;
      onSshError: (callback: (deviceId: string, error: string) => void) => () => void;
      onSshStatus: (callback: (deviceId: string, status: string) => void) => () => void;
    };
  }
}

export {};
