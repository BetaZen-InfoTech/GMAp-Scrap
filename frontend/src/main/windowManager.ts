import { BrowserWindow, shell } from 'electron';
import path from 'path';
import { WindowInfo } from '../shared/types';

const windows = new Map<number, WindowInfo>();

const isDev = process.env.NODE_ENV !== 'production';
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

function getPreloadPath(): string {
  return path.join(__dirname, '../preload/preload.js');
}

function getIndexPath(): string {
  return path.join(__dirname, '../../dist/index.html');
}

export function createDashboardWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Google Maps Scraper',
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
    backgroundColor: '#0f172a',
  });

  loadWindow(win, '/');

  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  windows.set(win.id, { windowId: win.id, type: 'dashboard' });

  win.on('closed', () => windows.delete(win.id));

  return win;
}

export function createPopupWindow(sessionId: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 700,
    minHeight: 500,
    title: `Scrape Session - ${sessionId.substring(0, 8)}`,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
    backgroundColor: '#0f172a',
  });

  loadWindow(win, `/popup/${sessionId}`);

  win.once('ready-to-show', () => win.show());

  windows.set(win.id, { windowId: win.id, type: 'popup', sessionId });

  win.on('closed', () => windows.delete(win.id));

  return win;
}

function loadWindow(win: BrowserWindow, route: string): void {
  if (isDev && VITE_DEV_SERVER_URL) {
    win.loadURL(`${VITE_DEV_SERVER_URL}${route}`);
  } else {
    win.loadFile(getIndexPath(), { hash: route });
  }
}

export function getDashboardWindows(): BrowserWindow[] {
  return BrowserWindow.getAllWindows().filter((w) => {
    const info = windows.get(w.id);
    return info?.type === 'dashboard';
  });
}

export function getPopupWindow(sessionId: string): BrowserWindow | undefined {
  for (const [id, info] of windows) {
    if (info.type === 'popup' && info.sessionId === sessionId) {
      return BrowserWindow.fromId(id) ?? undefined;
    }
  }
  return undefined;
}

export function getAllWindows(): WindowInfo[] {
  return Array.from(windows.values());
}
