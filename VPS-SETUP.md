# Running `frontend-nodejs` on a VPS

## Prerequisites

- Ubuntu 20.04+ (or any Debian-based Linux)
- Root or sudo access
- Git installed (`sudo apt-get install -y git`)
- Backend API already running (`.env` points to `https://gmap-scrap-backend-api.betazeninfotech.com`)

---

## 1. Install Node.js (v18+)

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # should show v18.x+
npm -v
```

## 2. Install system dependencies for Playwright

```bash
sudo apt-get update
sudo apt-get install -y \
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
  libxcomposite1 libxdamage1 libxrandr2 libgbm1 \
  libpango-1.0-0 libcairo2 libasound2 libxshmfence1 \
  libx11-xcb1 fonts-liberation libappindicator3-1 xdg-utils
```

## 3. Clone the repo

```bash
cd /home/user
git clone https://github.com/BetaZen-InfoTech/BetaZen-G-Map-Scrap.git
cd BetaZen-G-Map-Scrap/frontend-nodejs
```

To pull latest changes later:

```bash
cd /home/user/BetaZen-G-Map-Scrap
git pull
```

## 4. Install dependencies

```bash
cd /home/user/BetaZen-G-Map-Scrap/frontend-nodejs
npm install
```

## 5. Install Playwright Chromium browser

```bash
npx playwright install chromium
```

## 6. Configure environment

Create the `.env` file:

```bash
echo "API_BASE_URL=https://gmap-scrap-backend-api.betazeninfotech.com" > .env
```

---

## 7. Run the scraper

### CLI arguments (non-interactive — required for auto-restart)

```bash
npm start -- "PC NAME" START-PIN END-PIN
```

Example:

```bash
npm start -- "VPS-1" 110001 200000
#             ^       ^      ^
#             nickname start  end pincode
```

### Interactive mode (manual)

```bash
npm start
# Will ask for nickname, start pincode, end pincode
```

---

## 8. Auto-restart with PM2 (recommended)

PM2 keeps the scraper running 24/7 and auto-restarts on crash or VPS reboot.

### Install PM2

```bash
sudo npm install -g pm2
```

### Start a scraper instance

```bash
cd /home/user/BetaZen-G-Map-Scrap/frontend-nodejs

pm2 start npm --name "scraper-1" -- start -- "PC NAME" START-PIN END-PIN
```

Example:

```bash
pm2 start npm --name "scraper-1" -- start -- "VPS-1" 110001 200000
```

### Run multiple instances (different pincode ranges)

```bash
pm2 start npm --name "scraper-1" -- start -- "VPS-1" 110001 200000
pm2 start npm --name "scraper-2" -- start -- "VPS-2" 200001 300000
pm2 start npm --name "scraper-3" -- start -- "VPS-3" 300001 400000
```

Each instance gets its own device nickname and pincode range.

### PM2 commands

```bash
pm2 status               # see all instances
pm2 logs                  # live logs (all instances)
pm2 logs scraper-1        # logs for one instance
pm2 restart scraper-1     # restart one instance
pm2 restart all           # restart all
pm2 stop scraper-1        # stop one
pm2 stop all              # stop all
pm2 delete scraper-1      # remove from pm2
```

### Auto-start on VPS reboot

```bash
pm2 startup               # generates startup script (run the command it prints)
pm2 save                   # save current process list
```

After this, all pm2 processes will auto-start when the VPS reboots.

### Update code and restart

```bash
cd /home/user/BetaZen-G-Map-Scrap
git pull
cd frontend-nodejs
npm install
pm2 restart all
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `Chromium not installed and Edge not found` | Run `npx playwright install chromium` |
| Playwright crashes with missing libs | Run the `apt-get install` command from Step 2 |
| `API error: connect ECONNREFUSED` | Check `.env` has the correct `API_BASE_URL` |
| `EACCES: permission denied` | Don't run as root, or fix: `chown -R $USER:$USER .` |
| High memory usage | Reduce `parallelTabs` in `src/config.js` (default 5) |
| Scraper skips all keywords | Already completed on backend; this is normal |
| PM2 process keeps restarting | Check `pm2 logs scraper-1` for the error |

## Key config tweaks (src/config.js)

| Setting | Default | Description |
|---------|---------|-------------|
| `headless` | `true` | Must be `true` on VPS (no GUI) |
| `parallelTabs` | `5` | Lower to 2-3 on low-RAM VPS |
| `batchSize` | `10` | Records per API batch |
| `scrollDelayMs` | `2000` | Delay between scroll attempts |
| `noNewScrollRetries` | `5` | Stop scrolling after N retries with no new results |
