import type { AdminSettings } from '../shared/types';

declare global {
  interface Window {
    electronAPI: {
      getSettings: () => Promise<AdminSettings>;
      saveSettings: (partial: Partial<AdminSettings>) => Promise<AdminSettings>;
      login: (password: string) => Promise<{ success: boolean; token?: string; error?: string }>;
      logout: () => Promise<{ success: boolean }>;
      getApiBaseUrl: () => Promise<string>;
      scrapeWebsite: (url: string, headless: boolean) => Promise<{ success: boolean; phones: string[]; error?: string }>;
    };
  }
}

export {};
