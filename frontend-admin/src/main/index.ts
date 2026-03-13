// .env is loaded via config.ts → loadEnv.ts (import side-effect)
import { app, BrowserWindow } from 'electron';
import { createMainWindow } from './windowManager';
import { setupIpcHandlers } from './ipcHandlers';

// Single-instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const wins = BrowserWindow.getAllWindows();
    if (wins.length > 0) {
      if (wins[0].isMinimized()) wins[0].restore();
      wins[0].focus();
    }
  });

  app.whenReady().then(() => {
    setupIpcHandlers();
    createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

process.on('uncaughtException', (err) => {
  console.error('[Admin Main] Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Admin Main] Unhandled rejection:', reason);
});
