import { Tray, Menu, nativeImage, BrowserWindow, app } from 'electron';
import path from 'path';
import fs from 'fs';

let tray: Tray | null = null;

function getTrayIcon(): Electron.NativeImage {
  const candidates = [
    // Packaged: icon in resources/assets/
    app.isPackaged
      ? path.join(process.resourcesPath, 'assets', 'icon.ico')
      : path.join(__dirname, '../../assets/icon.ico'),
    // Dev fallback: public folder
    path.join(__dirname, '../../public/tray-icon.png'),
  ];

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return nativeImage.createFromPath(p).resize({ width: 16, height: 16 });
      }
    } catch {
      // ignore
    }
  }

  return nativeImage.createEmpty();
}

export function createTray(getMainWindow: () => BrowserWindow | null): Tray {
  const icon = getTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('Google Maps Scraper — Running in background');

  function buildMenu(): void {
    const win = getMainWindow();
    const isVisible = win?.isVisible() ?? false;

    const menu = Menu.buildFromTemplate([
      {
        label: isVisible ? 'Hide Dashboard' : 'Show Dashboard',
        click: () => {
          const w = getMainWindow();
          if (!w) return;
          if (w.isVisible()) {
            w.hide();
          } else {
            w.show();
            w.focus();
          }
          buildMenu();
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          app.quit();
        },
      },
    ]);

    tray!.setContextMenu(menu);
  }

  buildMenu();

  // Single click → show/focus window
  tray.on('click', () => {
    const w = getMainWindow();
    if (!w) return;
    if (w.isVisible()) {
      w.focus();
    } else {
      w.show();
      w.focus();
    }
    buildMenu();
  });

  return tray;
}

export function destroyTray(): void {
  tray?.destroy();
  tray = null;
}
