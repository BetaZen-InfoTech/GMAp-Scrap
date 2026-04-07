import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../shared/types';
import { getSettings, saveSettings } from './store';
import axios from 'axios';
import { getApiBaseUrl } from './config';
import * as https from 'https';
import * as http from 'http';
import { sshConnect, sshCommand, sshCommandAll, sshDisconnect } from './sshManager';

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

  ipcMain.handle(IPC_CHANNELS.SCRAPE_WEBSITE, async (_, url: string, headless = false) => {
    try {
      const text = headless ? await fetchUrlHeadless(url) : await fetchUrl(url);
      const phones = extractPhones(text);
      const emails = extractEmails(text);
      return { success: true, phones, emails };
    } catch (err: unknown) {
      return { success: false, phones: [], emails: [], error: err instanceof Error ? err.message : String(err) };
    }
  });

  // ── SSH handlers ───────────────────────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.SSH_CONNECT, async (_, deviceId: string, host: string, port: number, username: string, password: string) => {
    return sshConnect(deviceId, host, port, username, password);
  });

  ipcMain.handle(IPC_CHANNELS.SSH_COMMAND, async (_, deviceId: string, command: string, raw?: boolean) => {
    return { success: sshCommand(deviceId, command, raw) };
  });

  ipcMain.handle(IPC_CHANNELS.SSH_COMMAND_ALL, async (_, command: string) => {
    return { success: true, count: sshCommandAll(command) };
  });

  ipcMain.handle(IPC_CHANNELS.SSH_DISCONNECT, async (_, deviceId?: string) => {
    sshDisconnect(deviceId);
    return { success: true };
  });
}

function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 15000,
    };
    const req = lib.get(options, (res) => {
      // Follow one redirect
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        fetchUrl(res.headers.location).then(resolve).catch(reject);
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
  });
}

function fetchUrlHeadless(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      show: false,
      webPreferences: { javascript: true, nodeIntegration: false, contextIsolation: true },
    });

    const timeout = setTimeout(() => {
      if (!win.isDestroyed()) win.destroy();
      reject(new Error('Headless fetch timed out (30s)'));
    }, 30000);

    win.loadURL(url).catch((e) => {
      clearTimeout(timeout);
      if (!win.isDestroyed()) win.destroy();
      reject(e);
    });

    win.webContents.on('did-finish-load', async () => {
      clearTimeout(timeout);
      try {
        const text = await win.webContents.executeJavaScript(
          'document.body ? document.body.innerText : ""'
        );
        if (!win.isDestroyed()) win.destroy();
        resolve(String(text));
      } catch (e) {
        if (!win.isDestroyed()) win.destroy();
        reject(e);
      }
    });

    win.webContents.on('did-fail-load', (_, _code, desc) => {
      clearTimeout(timeout);
      if (!win.isDestroyed()) win.destroy();
      reject(new Error(`Page load failed: ${desc}`));
    });
  });
}

function extractEmails(html: string): string[] {
  const text = html.replace(/<[^>]+>/g, ' ');
  const pattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const found = new Set<string>();
  const matches = text.match(pattern) || [];
  for (const m of matches) {
    const clean = m.toLowerCase().trim();
    // Skip common false positives
    if (clean.endsWith('.png') || clean.endsWith('.jpg') || clean.endsWith('.gif') ||
        clean.endsWith('.svg') || clean.endsWith('.webp') || clean.endsWith('.css') ||
        clean.endsWith('.js') || clean.includes('example.com') ||
        clean.includes('sentry.io') || clean.includes('wixpress.com')) continue;
    found.add(clean);
  }
  return Array.from(found).slice(0, 20);
}

function extractPhones(html: string): string[] {
  // Strip HTML tags for cleaner extraction
  const text = html.replace(/<[^>]+>/g, ' ');
  const patterns = [
    // Indian mobile: 6-9 followed by 9 digits (with optional spaces/dashes)
    /(?<!\d)(?:\+91[\s-]?)?[6-9]\d{2}[\s-]?\d{3}[\s-]?\d{4}(?!\d)/g,
    // Generic 10-digit
    /(?<!\d)\d{5}[\s-]?\d{5}(?!\d)/g,
    // Landline with STD: 2-4 digit code + 6-8 digit number
    /(?<!\d)0\d{2,4}[\s-]?\d{6,8}(?!\d)/g,
  ];
  const found = new Set<string>();
  for (const pattern of patterns) {
    const matches = text.match(pattern) || [];
    for (const m of matches) {
      const clean = m.replace(/[\s-]/g, '');
      if (clean.length >= 10 && clean.length <= 13) {
        found.add(clean);
      }
    }
  }
  return Array.from(found).slice(0, 20); // max 20 phones per page
}
