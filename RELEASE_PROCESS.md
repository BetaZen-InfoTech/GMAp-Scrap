# Release Process — BetaZen Google Maps Scraper

Step-by-step guide to build, configure, and distribute the Scraper + Admin Panel desktop applications.

**Maintained by:** BetaZen InfoTech

---

## Project Architecture

```
BetaZen-G-Map-Scrap/
├── backend/                  # Node.js + Express v5 API server
│   ├── src/
│   │   ├── config/db.js      # MongoDB connection
│   │   ├── models/           # Device, BusinessNiche, PinCode, ScrapedData, etc.
│   │   ├── routes/           # REST + admin API routes
│   │   ├── services/         # Change streams, Socket.IO
│   │   └── index.js          # Server entry point
│   ├── .env                  # APP_STATE, MONGODB_URI, PORT
│   └── .env.example
│
├── frontend/                 # Scraper Electron app (React + TypeScript + Tailwind)
│   ├── src/
│   │   ├── main/             # Electron main process (scraping, tray, IPC)
│   │   ├── renderer/         # React UI (pages, components)
│   │   └── shared/           # Shared types
│   ├── .env                  # APP_STATE, API URLs
│   ├── .env.example
│   └── package.json          # Build scripts (portable + installer)
│
├── frontend-admin/           # Admin Panel Electron app
│   ├── src/
│   │   ├── main/             # Electron main process
│   │   ├── renderer/         # React admin UI (devices, sessions, analytics)
│   │   └── shared/           # Shared types
│   ├── .env                  # APP_STATE, API URLs
│   ├── .env.example
│   └── package.json          # Build scripts (portable)
│
├── seed-data/                # Seed JSON files
│   ├── business_niches.json  # 247 business niches
│   └── indian-pincode.json   # 19,300 Indian pincodes
│
└── RELEASE_PROCESS.md        # ← this file
```

---

## Prerequisites

- **Node.js** v18+ (LTS recommended)
- **npm** v9+
- **Windows 10/11 x64** (builds target Windows only)

---

## Part 1 — Backend Setup

### 1.1 Install & Start

```bash
cd backend
npm install

npm start       # production
npm run dev     # development (auto-restart)
```

### 1.2 Seed the Database (first time only)

```bash
npm run seed
```

Populates:
- `Business-Niches` — 247 business categories
- `PinCode-Dataset` — 19,300 Indian pincodes

### 1.3 Environment Variables — `backend/.env`

```env
# ============================================================
# App state: local | dev | prod
# local → local machine, local MongoDB
# dev   → local machine, remote MongoDB
# prod  → deployed server, remote MongoDB
# ============================================================
APP_STATE=prod

PORT=5000

# MongoDB connection string
MONGODB_URI=mongodb://BetaZen:BetaZen2023@mongo.betazeninfotech.com:27017/g_map_scrapping?authSource=g_map_scrapping

# Local MongoDB (uncomment when APP_STATE=local)
# MONGODB_URI=mongodb://127.0.0.1:27017/g_map_scrapping

# API URLs per state
LOCAL_API_URL=http://127.0.0.1:5000
DEV_API_URL=http://127.0.0.1:5000
PROD_API_URL=https://gmap-scrap-backend-api.betazeninfotech.com

NODE_ENV=production
```

### 1.4 Key API Endpoints

| Method | Endpoint                          | Description                       |
|--------|-----------------------------------|-----------------------------------|
| GET    | `/health`                         | Server health check               |
| POST   | `/api/devices/register`           | Register new device by password   |
| POST   | `/api/devices/verify`             | Verify an existing device ID      |
| POST   | `/api/scraped-data/batch`         | Submit scraped data batch         |
| POST   | `/api/scraped-data/excel`         | Upload Excel file                 |
| POST   | `/api/scraped-data/session-stats` | Upsert session statistics         |
| GET    | `/api/pincodes/range`             | Get pincodes in range             |
| GET    | `/api/niches`                     | Get all business niches           |

---

## Part 2 — Environment Configuration (`.env`)

Both frontend apps use the same `.env` format. Change `APP_STATE` to switch environments — no code changes needed.

### `frontend/.env` and `frontend-admin/.env`

```env
# ============================================================
# App state: local | dev | prod
# local → http://127.0.0.1:5000           (local machine, local backend)
# dev   → http://127.0.0.1:5000           (local machine, remote backend)
# prod  → remote production server         (betazeninfotech.com)
# ============================================================
APP_STATE=prod

# API URLs per state
LOCAL_API_URL=http://127.0.0.1:5000
DEV_API_URL=http://127.0.0.1:5000
PROD_API_URL=https://gmap-scrap-backend-api.betazeninfotech.com
```

| APP_STATE | API URL                                              | Use Case                       |
|-----------|------------------------------------------------------|--------------------------------|
| `local`   | `http://127.0.0.1:5000`                              | Local backend + local MongoDB  |
| `dev`     | `http://127.0.0.1:5000`                              | Local backend + remote MongoDB |
| `prod`    | `https://gmap-scrap-backend-api.betazeninfotech.com` | Production server              |

---

## Part 3 — Device Registration Flow (Scraper App)

On first launch of the Scraper app on any new device:

1. App checks local `electron-store` for `isRegistered` flag
2. If not registered → **Registration screen** is shown
3. User enters a **nickname** (device label) and the activation password: **`BetaZen@2023`**
4. App POSTs to backend `/api/devices/register` with password, nickname, and device info
5. Backend validates password, saves device to `Devices` collection, returns `deviceId`
6. `deviceId`, `nickname`, and `isRegistered: true` saved locally
7. App opens the main scraping Dashboard

> **Important:** Backend must be running and reachable at registration time.

---

## Part 4 — Building the Scraper App (`frontend/`)

### 4.1 Setup

```bash
cd frontend
npm install
npx playwright install chromium
```

Verify browsers at: `node_modules/playwright/.local-browsers/`

### 4.2 Configure `.env`

Set `APP_STATE=prod` before building:

```env
APP_STATE=prod
PROD_API_URL=https://gmap-scrap-backend-api.betazeninfotech.com
```

### 4.3 Version Bump

Update version in `frontend/package.json`:
```json
{ "version": "1.0.1" }
```

### 4.4 Build Commands

| Command                  | Output                          |
|--------------------------|---------------------------------|
| `npm run dev`            | Dev server (hot reload)         |
| `npm run build`          | Both installer + portable       |
| `npm run build:portable` | Portable EXE only               |
| `npm run build:installer`| NSIS installer only             |
| `npm run build:all`      | Both installer + portable       |

```bash
npm run build:all
```

### 4.5 Build Output — `frontend/release/`

```
release/
├── Google Maps Scraper Setup 1.0.0.exe          # NSIS installer
├── Google Maps Scraper-Portable-1.0.0.exe       # Portable EXE
├── Google Maps Scraper Setup 1.0.0.exe.blockmap
├── latest.yml
└── builder-effective-config.yaml
```

### 4.6 Installer vs Portable

| Feature                     | Installer (NSIS) | Portable |
|-----------------------------|-----------------|----------|
| Installation required       | Yes             | No       |
| Start menu shortcut         | Yes             | No       |
| Uninstaller included        | Yes             | No       |
| Can choose install directory| Yes             | N/A      |
| Run from USB/any folder     | No              | Yes      |
| Settings storage            | `%APPDATA%`     | `%APPDATA%` |
| System tray support         | Yes             | Yes      |

---

## Part 5 — Building the Admin Panel (`frontend-admin/`)

### 5.1 Setup

```bash
cd frontend-admin
npm install
```

### 5.2 Configure `.env`

Set `APP_STATE=prod` before building:

```env
APP_STATE=prod
PROD_API_URL=https://gmap-scrap-backend-api.betazeninfotech.com
```

### 5.3 Version Bump

Update version in `frontend-admin/package.json`:
```json
{ "version": "1.0.1" }
```

### 5.4 Build Commands

| Command                  | Output                          |
|--------------------------|---------------------------------|
| `npm run dev`            | Dev server (hot reload)         |
| `npm run build`          | Both installer + portable       |
| `npm run build:portable` | Portable EXE only               |
| `npm run build:installer`| NSIS installer only             |
| `npm run build:all`      | Both installer + portable       |

```bash
npm run build:all
```

### 5.5 Build Output — `frontend-admin/release/`

```
release/
├── BetaZen Admin Dashboard Setup 1.0.0.exe          # NSIS installer
├── BetaZen Admin Dashboard-Portable-1.0.0.exe       # Portable EXE
├── BetaZen Admin Dashboard Setup 1.0.0.exe.blockmap
├── latest.yml
└── builder-effective-config.yaml
```

### 5.6 Admin Panel Features

- **Devices** — View all registered devices, live stats (CPU, RAM, disk)
- **Sessions** — Browse all scraping sessions across devices
- **Jobs** — Monitor scrape job progress per device
- **Analytics** — Records per device, top pincodes, category breakdown
- **Live updates** — Real-time stats via Socket.IO WebSocket

---

## Part 6 — System Tray Behavior (Scraper App)

The scraper app minimizes to system tray instead of closing:

| Action                | Result                                         |
|-----------------------|------------------------------------------------|
| Click X button        | Window hides to system tray (jobs keep running)|
| Click tray icon       | Window shows and focuses                       |
| Right-click tray icon | Context menu: Show/Hide Dashboard, Quit        |
| Tray → Quit           | App fully exits                                |
| Screen lock (Win+L)   | Background jobs keep running                   |

> Background scrape jobs continue running even when the window is hidden.

---

## Part 7 — Distribution

### Scraper App — Portable EXE

1. Copy `Google Maps Scraper-Portable-{version}.exe` from `frontend/release/`
2. Share via USB, cloud drive, or file transfer
3. Double-click to run — no installation needed
4. First run → enter nickname + password `BetaZen@2023`

### Scraper App — Installer

1. Copy `Google Maps Scraper Setup {version}.exe` from `frontend/release/`
2. Run installer → choose directory → complete setup
3. First run → same registration flow

### Admin Panel — Portable EXE

1. Copy `BetaZen Admin Dashboard-Portable-{version}.exe` from `frontend-admin/release/`
2. Double-click to run — no installation needed
3. Login with admin credentials

### Admin Panel — Installer

1. Copy `BetaZen Admin Dashboard Setup {version}.exe` from `frontend-admin/release/`
2. Run installer → choose directory → complete setup
3. Login with admin credentials

> **Backend must be reachable** for both apps to function.

---

## Part 8 — Pre-Release Checklist

### Backend
- [ ] Server running and accessible (`/health` returns 200)
- [ ] MongoDB connected and seeded (247 niches, 19,300 pincodes)
- [ ] Device registration works with password `BetaZen@2023`

### Scraper App (`frontend/`)
- [ ] Version bumped in `package.json`
- [ ] `.env` set to `APP_STATE=prod`
- [ ] Test registration on fresh device
- [ ] Test scraping end-to-end
- [ ] Playwright browsers bundled in `node_modules/playwright/.local-browsers/`
- [ ] `npm run build:all` completes without errors
- [ ] Test portable EXE on clean machine
- [ ] Test installer on test machine
- [ ] System tray works (hide/show, jobs continue in background)
- [ ] File size ~200–400MB (includes Chromium)

### Admin Panel (`frontend-admin/`)
- [ ] Version bumped in `package.json`
- [ ] `.env` set to `APP_STATE=prod`
- [ ] `npm run build:all` completes without errors
- [ ] Test portable EXE — login, view devices, sessions, analytics
- [ ] Test installer — install, login, verify all pages
- [ ] Live stats update via WebSocket

---

## Part 9 — Troubleshooting

### Registration fails — "Connection refused"
Backend not running or wrong `APP_STATE`:
```bash
cd backend && npm run dev
# Check APP_STATE in frontend/.env
```

### Registration fails — "Invalid password"
Password must be exactly: `BetaZen@2023`

### Build fails — "Cannot find module"
```bash
rm -rf node_modules dist dist-electron
npm install
npm run build:all
```

### Playwright browsers not found in build
```bash
npx playwright install chromium
```

### Portable EXE shows blank screen
Vite output missing:
```bash
npx vite build
```

### App crashes on launch
Check logs: `%APPDATA%/google-maps-scraper/logs/`

### MongoDB connection fails
- Verify `MONGODB_URI` in `backend/.env`
- Ensure `authSource=g_map_scrapping` is in the connection string
- Check network access to `mongo.betazeninfotech.com:27017`

---

## Part 10 — Build Configuration Reference

### Scraper App — `frontend/package.json` → `build`

```json
{
  "build": {
    "appId": "com.betazen.mapscraper",
    "productName": "Google Maps Scraper",
    "directories": { "output": "release" },
    "win": {
      "target": [
        { "target": "nsis", "arch": ["x64"] },
        { "target": "portable", "arch": ["x64"] }
      ],
      "icon": "assets/icon.ico"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true
    },
    "portable": {
      "artifactName": "${productName}-Portable-${version}.${ext}"
    },
    "files": ["dist/**/*", "dist-electron/**/*"],
    "extraResources": [
      {
        "from": "node_modules/playwright/.local-browsers",
        "to": "playwright-browsers",
        "filter": ["**/*"]
      }
    ]
  }
}
```

### Admin Panel — `frontend-admin/package.json` → `build`

```json
{
  "build": {
    "appId": "com.betazen.admin-dashboard",
    "productName": "BetaZen Admin Dashboard",
    "directories": { "output": "release" },
    "win": {
      "target": [
        { "target": "nsis", "arch": ["x64"] },
        { "target": "portable", "arch": ["x64"] }
      ],
      "icon": "assets/icon.ico"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true
    },
    "portable": {
      "artifactName": "${productName}-Portable-${version}.${ext}"
    },
    "files": ["dist/**/*", "dist-electron/**/*"]
  }
}
```

### Icon

Place app icon at `assets/icon.ico` in each project. Recommended: 256x256px ICO with multiple resolutions (16, 32, 48, 64, 128, 256).

---

## Quick Reference

```bash
# ── Backend ──────────────────────────────────
cd backend
npm install
npm run seed              # first time only
npm run dev               # development
npm start                 # production

# ── Scraper App (dev) ───────────────────────
cd frontend
npm install
npx playwright install chromium
npm run dev

# ── Scraper App (build) ────────────────────
npm run build:portable    # portable EXE only
npm run build:installer   # NSIS installer only
npm run build:all         # both

# Output → frontend/release/

# ── Admin Panel (dev) ──────────────────────
cd frontend-admin
npm install
npm run dev

# ── Admin Panel (build) ───────────────────
npm run build:portable    # portable EXE only
npm run build:installer   # NSIS installer only
npm run build:all         # both

# Output → frontend-admin/release/
```
