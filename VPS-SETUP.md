# Running `frontend-nodejs` on a VPS

## Prerequisites

- Ubuntu 20.04+ (or any Debian-based Linux)
- Root or sudo access
- Git installed (`sudo apt-get install -y git`)

---

## 1. Install Node.js (v22+)

Use **NVM** (Node Version Manager) — more reliable than the NodeSource apt repo which sometimes fails on certain VPS providers.

```bash
# Install NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

# Reload shell so nvm command is available
source ~/.bashrc

# Install Node.js v22
nvm install 22
nvm use 22
nvm alias default 22

# Verify
node -v   # should show v22.x+
npm -v
```

> **Why NVM?** The NodeSource apt repo (`deb.nodesource.com`) sometimes fails with
> `does not have a Release file` on certain VPS providers. NVM installs Node.js directly
> without touching apt repos, so it always works.

**If you already installed the wrong version via apt** (e.g. Node 18):

```bash
sudo apt-get remove -y nodejs
sudo apt-get autoremove -y
# Then follow the NVM steps above
```

## 2. Clone the repo

```bash
cd ~
git clone https://github.com/BetaZen-InfoTech/GMAp-Scrap.git
cd GMAp-Scrap/frontend-nodejs
```

> If the repo already exists, pull the latest instead:
>
> ```bash
> cd ~/GMAp-Scrap && git pull
> ```

## 3. Install dependencies

```bash
cd ~/GMAp-Scrap/frontend-nodejs
npm install
```

## 4. Install Playwright Chromium + system libraries

```bash
npx playwright install chromium
npx playwright install-deps chromium
```

First command downloads the Chromium browser binary.
Second command auto-installs all required OS libraries for your Ubuntu version.

## 5. Configure environment

Create the `.env` file:

```bash
cat > .env << 'EOF'
# APP_STATE: local | dev | prod
APP_STATE=prod

# API URLs
LOCAL_API_URL=http://127.0.0.1:5000
DEV_API_URL=http://127.0.0.1:5000
PROD_API_URL=https://gmap-scrap-backend-api.betazeninfotech.com

# Browser: true = headless (no GUI), false = show browser window
HEADLESS=true
EOF
```

> On VPS, always use `APP_STATE=prod` and `HEADLESS=true` (no GUI available).

---

## 6. Run the scraper

### Two modes

**Range mode** — scrape all pincodes from START to END (single job):

```bash
npm start -- "PC NAME" START-PIN END-PIN
```

```bash
# Example: scrape pincodes 700001 to 700010
npm start -- "VPS-1" 700001 700010
```

**Multi-job mode** — run N parallel jobs, each with 100 pincodes (auto-split):

```bash
npm start -- "PC NAME" START-PIN NUMBER-OF-JOBS
```

```bash
# Example: 10 parallel jobs x 100 pincodes = 1000 pincodes starting from 700001
npm start -- "VPS-1" 700001 10
```

> If the 3rd argument is < 1000, it's treated as number of jobs.
> If >= 1000, it's treated as an end pincode.
>
> All jobs run **in parallel** (not sequentially). A built-in CPU throttle
> pauses sessions when CPU exceeds 75% and resumes when it drops back down.

### Interactive mode (manual)

```bash
npm start
# Will ask for nickname, start pincode, end pincode / number of jobs
```

### Important behavior

- **One IP = one device.** Each VPS registers once. If already registered, it reuses the existing device ID automatically.
- **Resume support.** If the scraper stops and you restart with the same pincode range, it skips already-completed searches.
- **No restart loop.** After all pincodes are scraped, the process exits cleanly. Running the same command again will print "All jobs already completed" and exit immediately.
- **Rounds 1, 2, 3** are tracked in a single database entry per (pincode, category, subCategory). No duplicate entries.

---

## 7. Running with PM2

PM2 manages your scraper processes — live logs, auto-restart on crash, survives SSH disconnect.

After all jobs complete, the scraper stays idle (no restart, no exit). Delete it manually when done.

### Install PM2 (one-time)

```bash
npm install -g pm2
```

> **No `sudo`.** NVM's global installs don't need sudo.

### Start a scraper

```bash
cd ~/GMAp-Scrap/frontend-nodejs
```

**Multi-job mode** (N jobs x 100 pincodes each):

```bash
pm2 start npm --name "scraper-1" -- start -- "VPS-1" 700001 10
```

**Range mode** (single job, all pincodes in range):

```bash
pm2 start npm --name "scraper-1" -- start -- "VPS-1" 700001 700050
```

### View live logs

```bash
pm2 logs scraper-1           # live logs for one scraper
pm2 logs                     # live logs for all scrapers
```

Press `Ctrl+C` to stop viewing (scraper keeps running).

### Run multiple scrapers (different pincode ranges)

```bash
pm2 start npm --name "scraper-1" -- start -- "VPS-1" 700001 10
pm2 start npm --name "scraper-2" -- start -- "VPS-1" 800001 10
pm2 start npm --name "scraper-3" -- start -- "VPS-1" 900001 10
```

> All instances share the same device ID (one IP = one device).
> Each gets a different pincode range so they don't overlap.

### PM2 commands

```bash
pm2 status               # see all scrapers + status
pm2 logs                 # live logs (all)
pm2 logs scraper-1       # live logs (one)
pm2 delete scraper-1     # remove one scraper
pm2 delete all           # remove all scrapers
```

### After completion

When all jobs finish, `pm2 status` shows the scraper as `online` (idle, not restarting).

```
┌────┬──────────┬──────┬───────┐
│ id │ name     │ mode │ status│
├────┼──────────┼──────┼───────┤
│ 0  │scraper-1 │ fork │online │  ← idle, all done
└────┴──────────┴──────┴───────┘
```

Clean up when done:

```bash
pm2 delete scraper-1     # remove one
pm2 delete all           # remove all
```

### Update code and restart

```bash
cd ~/GMAp-Scrap && git pull && cd frontend-nodejs && npm install && npx playwright install chromium && npx playwright install-deps chromium
```

Then start new scraper instances. Old completed jobs will be skipped automatically.

---

## 8. Configure Firewall (UFW)

Allow SSH and all other ports so the scraper can reach external APIs:

```bash
sudo apt-get install -y ufw

# Allow SSH (port 22) — do this FIRST to avoid locking yourself out
sudo ufw allow 22

# Allow all other traffic (incoming + outgoing)
sudo ufw default allow incoming
sudo ufw default allow outgoing

# Enable firewall
sudo ufw enable

# Verify status
sudo ufw status verbose
```

> **Important:** Always run `sudo ufw allow 22` before `sudo ufw enable`, or you will lose SSH access.

---

## 9. Monitor VPS resources

### Live one-liner (CPU + RAM + Network speed + Total usage)

```bash
sudo apt-get install -y sysstat vnstat
```

```bash
watch -n 2 'echo "$(top -bn1 | grep "Cpu(s)" | awk "{printf \"CPU: %.0f%%\", 100-\$8}") | $(free -h | awk "/Mem:/{printf \"RAM: %s/%s\", \$3, \$2}") | $(cat /proc/net/dev | awk "/eth0|ens/{split(\$0,a,\":\"); split(a[2],b); printf \"Net: ↓%s ↑%s\", b[1], b[9]}") | $(vnstat --oneline 2>/dev/null | awk -F\; "{printf \"Today: %s\", \$11}" || echo "Today: N/A")"'
```

This shows a live updating line like:

```
CPU: 23% | RAM: 1.2G/4.0G | Net: ↓123456789 ↑987654 | Today: 2.5 GB
```

### Speed test (after login)

Run a quick internet speed test to verify the VPS network performance:

```bash
# Install speedtest CLI (one-time)
sudo apt-get install -y curl
curl -s https://packagecloud.io/install/repositories/ookla/speedtest-cli/script.deb.sh | sudo bash
sudo apt-get install -y speedtest

# Run speedtest
speedtest
```

Or use the Python-based `speedtest-cli` (no repo setup needed):

```bash
# Install
sudo apt-get install -y speedtest-cli

# Run
speedtest-cli
```

#### Auto-run speedtest on every SSH login

```bash
echo 'echo "--- Speed Test ---" && speedtest-cli --simple' >> ~/.bashrc
source ~/.bashrc
```

### Other useful tools

```bash
htop                      # visual CPU + RAM dashboard
nload                     # live network speed graph
vnstat -d                 # daily internet usage
vnstat -m                 # monthly internet usage
glances                   # all-in-one dashboard (CPU + RAM + Disk + Net)
```

Install all at once:

```bash
sudo apt-get install -y htop nload vnstat glances
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `Chromium not installed` | Run `npx playwright install chromium` |
| Playwright crashes with missing libs | Run `npx playwright install-deps chromium` |
| `API error: connect ECONNREFUSED` | Check `.env` has the correct API URL |
| `EACCES: permission denied` | Don't run as root, or fix: `chown -R $USER:$USER .` |
| High memory usage | Reduce `parallelTabs` in `src/config.js` (default 5) |
| Scraper skips all keywords | Already completed — this is normal |
| "All jobs already completed" | All pincodes in that range are done. Use a new range. |
| "IP already registered" | Normal — reuses existing device. No action needed. |
| NodeSource repo: `does not have a Release file` | Use NVM instead — see Step 1 |
| `node -v` shows v18 after install | Wrong version from apt; uninstall and use NVM |
| `nvm: command not found` after install | Run `source ~/.bashrc` then retry |

## Key config tweaks

### .env file

| Setting | VPS Value | Description |
|---------|-----------|-------------|
| `APP_STATE` | `prod` | Use `prod` for production API |
| `HEADLESS` | `true` | Must be `true` on VPS (no GUI) |

### src/config.js

| Setting | Default | Description |
|---------|---------|-------------|
| `parallelTabs` | `5` | Lower to 2-3 on low-RAM VPS |
| `batchSize` | `10` | Records per API batch |
| `scrollDelayMs` | `2000` | Delay between scroll attempts |
| `noNewScrollRetries` | `5` | Stop scrolling after N retries with no new results |
