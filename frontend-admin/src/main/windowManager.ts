import { BrowserWindow, shell } from 'electron';
import path from 'path';

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

function getPreloadPath() {
  return path.join(__dirname, '../preload/preload.js');
}

function getIndexPath() {
  return path.join(__dirname, '../../dist/index.html');
}

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'BetaZen Admin Dashboard',
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
    backgroundColor: '#0f172a',
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(getIndexPath());
  }

  win.once('ready-to-show', () => {
    win.show();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  return win;
}
