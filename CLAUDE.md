# BetaZen G-Map Scraper — Claude Code Instructions

## Project Overview
Google Maps business scraper with multi-device support, job tracking, and admin dashboard.

## Monorepo Structure
```
BetaZen-G-Map-Scrap/
  backend/          — Express v5 API + MongoDB (Mongoose)
  frontend/         — Electron + React 18 scraper app (Vite + TypeScript)
  frontend-admin/   — Electron + React 18 admin dashboard (Vite + TypeScript)
  frontend-nodejs/  — Node.js CLI scraper (no Electron, pure Node)
  seed-data/        — MongoDB seed JSON files (pincodes, niches)
```

## Tech Stack
- **Backend:** Node.js, Express v5, MongoDB Atlas (Mongoose), Socket.IO
- **Frontend/Admin:** Electron, React 18, TypeScript, Tailwind CSS, Zustand, Vite
- **Node CLI:** Node.js, Playwright (Chromium), chalk, axios
- **Shared:** IPC via contextBridge + ipcMain/ipcRenderer

## Key Rules
- **DO NOT modify `ScrapExeFile/elc-software/`** — only update `frontend/`, `frontend-admin/`, `frontend-nodejs/`, and `backend/`
- API endpoints are **hardcoded in code**, not user-configurable
- Always save `_id` from MongoDB operations
- Duplicates are **saved** to DB with `isDuplicate: true` flag (not skipped)
- Environment is controlled by `APP_STATE` variable: `local | dev | prod`

## Environment Files
- `.env` — gitignored, local secrets (each device has its own)
- `.env.local` — APP_STATE=local config (committed to git)
- `.env.dev` — APP_STATE=dev config (committed to git)
- `.env.prod` — APP_STATE=prod config (committed to git)

## Important Paths
| What | Path |
|------|------|
| Backend entry | `backend/src/index.js` |
| Backend routes | `backend/src/routes/` |
| Backend models | `backend/src/models/` |
| Frontend main | `frontend/src/main/` |
| Frontend renderer | `frontend/src/renderer/` |
| Frontend shared types | `frontend/src/shared/types.ts` |
| Admin main | `frontend-admin/src/main/` |
| Admin renderer | `frontend-admin/src/renderer/` |
| Node CLI entry | `frontend-nodejs/src/index.js` |
| Node CLI scraper | `frontend-nodejs/src/scraper.js` |
| Node CLI config | `frontend-nodejs/src/config.js` |

## API Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/scraped-data/batch` | POST | Save scraped records in batch |
| `/api/scraped-data/excel` | POST | Upload Excel file |
| `/api/scraped-data/session-stats` | POST | Upsert session statistics |
| `/api/pincodes/range` | GET | Fetch pincodes by range |
| `/api/niches` | GET | Fetch all business niches |
| `/api/scrape-tracking` | POST/GET/PATCH | Job-level progress tracking |
| `/api/devices` | POST/GET | Device registration/listing |
| `/api/device-history` | POST/GET | Device system stats history |

## MongoDB Collections
- `Scraped-Data` — scraped business records (with `isDuplicate` flag)
- `Excel-Uploads` — uploaded Excel file metadata
- `Session-Stats` — per-session statistics
- `Search-Status` — per-search completion tracking (pincode + niche + round)
- `Scrape-Tracking` — job-level progress tracking
- `Devices` — registered scraper devices
- `Device-History` — device system stats over time
- `Business-Niches` — niche categories/subcategories
- `Pin-Codes` — Indian pincode database

## Duplicate Detection
Checks by: Phone + Rating + Reviews + Category + PlusCode (all 5 must match)

## Data Flow
1. CLI/Electron starts scraping session with keyword (pincode + niche + round)
2. Playwright opens Google Maps, scrolls feed, extracts business details
3. Records sent to backend in batches via `/api/scraped-data/batch`
4. Excel generated locally and uploaded via `/api/scraped-data/excel`
5. Session stats saved via `/api/scraped-data/session-stats`
6. Search completion tracked via `/api/scrape-tracking`

## Running Locally
```bash
# Backend
cd backend && npm install && npm start

# Node CLI scraper
cd frontend-nodejs && npm install && npm start -- "HOSTNAME" 700001 10

# Frontend Electron (dev)
cd frontend && npm install && npm run dev

# Admin Electron (dev)
cd frontend-admin && npm install && npm run dev
```
