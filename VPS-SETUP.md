# Running `frontend-nodejs` on a VPS

## Prerequisites

- Ubuntu 20.04+ (or any Debian-based Linux)
- Root or sudo access
- Git installed (`sudo apt-get install -y git`)

---

## 1. Install Node.js (v22+)

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # should show v22.x+
npm -v
```

## 2. Clone the repo

```bash
cd /home/user
git clone https://github.com/BetaZen-InfoTech/GMAp-Scrap.git
cd GMAp-Scrap/frontend-nodejs
```

To pull latest changes later:

```bash
cd /home/user/GMAp-Scrap
git pull
```

## 3. Install dependencies

```bash
cd /home/user/GMAp-Scrap/frontend-nodejs
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
echo "API_BASE_URL=https://gmap-scrap-backend-api.betazeninfotech.com" > .env
```

---

## 6. Run the scraper

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

## 7. Auto-restart with PM2 (recommended)

PM2 keeps the scraper running 24/7 and auto-restarts on crash or VPS reboot.

### Install PM2

```bash
sudo npm install -g pm2
```

### Start a scraper instance

```bash
cd /home/user/GMAp-Scrap/frontend-nodejs

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
cd /home/user/GMAp-Scrap
git pull
cd frontend-nodejs
npm install
pm2 restart all
```

---

## 8. Monitor VPS resources

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
