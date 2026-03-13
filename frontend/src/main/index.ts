// .env is loaded via config.ts → loadEnv.ts (import side-effect)
import { app, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import { createDashboardWindow } from './windowManager';
import { setupIpcHandlers } from './ipcHandlers';
import { createTray } from './trayManager';

// When packaged, point Playwright to the bundled browsers inside resources/
// The bundled browsers are placed there by the electron-builder extraResources config.
if (app.isPackaged) {
  const bundledBrowsersPath = path.join(process.resourcesPath, 'playwright-browsers');
  if (fs.existsSync(bundledBrowsersPath)) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = bundledBrowsersPath;
  }
}

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;

// Set to true when actually quitting (e.g. tray Quit, not just closing window)
let isQuitting = false;
app.on('before-quit', () => { isQuitting = true; });

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  setupIpcHandlers();
  mainWindow = createDashboardWindow();

  // Intercept close: hide to tray instead of quitting
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  // Create system tray icon
  createTray(() => mainWindow);

  app.on('activate', () => {
    // macOS: re-show window on dock click
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
});

// App stays alive in tray — only quit via tray menu "Quit"
app.on('window-all-closed', () => {
  // Do nothing — tray keeps the process running
});

// Handle uncaught errors gracefully
process.on('uncaughtException', (error) => {
  console.error('[Main Process] Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Main Process] Unhandled rejection:', reason);
});
