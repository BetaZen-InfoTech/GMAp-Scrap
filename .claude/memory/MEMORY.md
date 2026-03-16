# BetaZen G-Map Scraper - Project Memory

## Project Structure
- **Backend:** `backend/` — Express v5 API + MongoDB Atlas
- **Frontend (Electron):** `frontend/` — Scraper app (React 18 + TypeScript + Vite)
- **Admin (Electron):** `frontend-admin/` — Admin dashboard (React 18 + TypeScript + Vite)
- **Node CLI:** `frontend-nodejs/` — Pure Node.js CLI scraper (Playwright)
- **Seed Data:** `seed-data/` — MongoDB seed JSON files
- **DO NOT modify `ScrapExeFile/elc-software/`**

## Environment Pattern
- `.env` — gitignored, device-specific secrets
- `.env.local` / `.env.dev` / `.env.prod` — committed to git, shared configs
- `APP_STATE` controls which API URL is used: local | dev | prod

## Key Architecture
- Electron + React 18 + TypeScript + Tailwind CSS + Zustand + Vite
- Node.js + Express v5 + MongoDB Atlas (Mongoose)
- Playwright for Google Maps scraping (Chromium)
- IPC: contextBridge + ipcMain/ipcRenderer
- Socket.IO for real-time updates (backend)

## Important Paths
- Backend entry: `backend/src/index.js`
- Backend config: `backend/src/config/db.js`
- Node CLI entry: `frontend-nodejs/src/index.js`
- Node CLI config: `frontend-nodejs/src/config.js`
- Frontend main: `frontend/src/main/`
- Frontend renderer: `frontend/src/renderer/`
- Admin main: `frontend-admin/src/main/`

## API Endpoints (hardcoded, not user-configurable)
- Batch data: `POST /api/scraped-data/batch`
- Excel upload: `POST /api/scraped-data/excel`
- Session stats: `POST /api/scraped-data/session-stats`
- Pincodes: `GET /api/pincodes/range`
- Niches: `GET /api/niches`
- Job tracking: `/api/scrape-tracking`
- Devices: `/api/devices`

## Data Patterns
- Always save `_id` from MongoDB operations
- Duplicate detection: Phone + Rating + Reviews + Category + PlusCode (all 5 match)
- Duplicates saved with `isDuplicate: true` (not skipped)
- Session stats upserted by sessionId
- Search status tracks per (pincode, niche, round) completion

## MongoDB Collections
- `Scraped-Data`, `Excel-Uploads`, `Session-Stats`
- `Search-Status`, `Scrape-Tracking`
- `Devices`, `Device-History`
- `Business-Niches`, `Pin-Codes`

## Node CLI Features
- Multi-job mode: `npm start -- "hostname" startPincode N` (N jobs x 5 pincodes each)
- CPU throttle: waits if CPU >= 75% before starting session
- Visual CPU bar, compact skip output, batched skip summaries
- Live system stats monitor bar at bottom of terminal
- Resume support: checks completedJobSearches and isAlreadyScraped
- Excel generation + upload per session

## User Preferences
- API endpoints hardcoded in code, not user-configurable
- Only update frontend/, frontend-admin/, frontend-nodejs/, backend/ directories
