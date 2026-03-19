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

**Multi-job mode** — run N parallel jobs, each with 5 pincodes (auto-split):

```bash
npm start -- "PC NAME" START-PIN NUMBER-OF-JOBS
```

```bash
# Example: 10 parallel jobs × 5 pincodes = 50 pincodes starting from 700001
npm start -- "VPS-1" 700001 10
```

> If the 3rd argument is < 1000, it's treated as number of jobs.
> If >= 1000, it's treated as an end pincode.
>
> All jobs run **in parallel** (not sequentially). A built-in CPU throttle
> pauses sessions when CPU exceeds 90% and resumes when it drops back down.

### Interactive mode (manual)

```bash
npm start
# Will ask for nickname, start pincode, end pincode / number of jobs
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
cd ~/GMAp-Scrap/frontend-nodejs
```

**Range mode** (single job, all pincodes in range):

```bash
pm2 start npm --name "scraper-1" -- start -- "VPS-1" 700001 700050
```

**Multi-job mode** (N parallel jobs × 5 pincodes each):

```bash
pm2 start npm --name "scraper-1" -- start -- "VPS-1" 700001 10
#                                                            ^^ 10 parallel jobs = 50 pincodes
```

### Run multiple instances

```bash
# Range mode examples
pm2 start npm --name "scraper-1" -- start -- "VPS-1" 110001 200000
pm2 start npm --name "scraper-2" -- start -- "VPS-2" 200001 300000

# Multi-job mode examples
pm2 start npm --name "scraper-3" -- start -- "VPS-3" 300001 10
pm2 start npm --name "scraper-4" -- start -- "VPS-4" 400001 15
```

Each instance gets its own device nickname and pincode range/jobs.

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

After a server reboot, PM2 can automatically restart all your scraper processes. This requires a one-time setup.

#### Quick setup (run once)

```bash
# 1. Generate startup script — this prints a sudo command, copy and run it
pm2 startup

# 2. Run the printed command (example, yours will differ):
#    sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu

# 3. Save current process list so PM2 knows what to restore after reboot
pm2 save
```

That's it. After any future reboot, PM2 will auto-restore all saved processes.

#### Step-by-step explanation

**Step 1:** Generate the startup script:

```bash
pm2 startup
```

This prints a command like:

```
[PM2] To setup the Startup Script, copy/paste the following command:
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu
```

**Step 2:** Copy and run the printed command exactly as shown (with sudo).

**Step 3:** Save the current process list so PM2 knows what to restart:

```bash
pm2 save
```

#### Verify it works

```bash
sudo reboot                # reboot the VPS
# SSH back in after ~1 min
pm2 status                 # all scrapers should be running
pm2 logs                   # verify they resumed
```

> **Important:** Run `pm2 save` every time you add, remove, or change PM2 processes.
> Otherwise, PM2 will restore the old process list on next reboot.

#### Troubleshooting startup hook

**If `pm2 startup` doesn't work** (some VPS providers):

```bash
# Remove old startup hook
pm2 unstartup systemd

# Regenerate
pm2 startup systemd
# Run the printed sudo command
pm2 save
```

**If processes don't come back after reboot:**

```bash
# Check if the systemd service exists
systemctl status pm2-$(whoami)

# If not active, re-run the setup
pm2 startup
# Run the printed sudo command
pm2 save

# Verify the service is enabled
systemctl is-enabled pm2-$(whoami)
```

### Update code and restart

```bash
cd ~/GMAp-Scrap && git pull && cd frontend-nodejs && npm install && npx playwright install chromium && npx playwright install-deps chromium && pm2 restart all
```

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

Sample output:
```
Testing download speed................
Download: 842.35 Mbit/s
Testing upload speed......
Upload: 521.10 Mbit/s
Ping: 3.24 ms
```

> Run this right after SSH login to quickly check if the VPS network is healthy before starting scrapers.

#### Auto-run speedtest on every SSH login

Add the speedtest to your shell profile so it runs automatically each time you log in:

```bash
echo 'echo "--- Speed Test ---" && speedtest-cli --simple' >> ~/.bashrc
source ~/.bashrc
```

`--simple` shows only ping/download/upload (faster, no progress dots):

```
Ping: 3.24 ms
Download: 842.35 Mbit/s
Upload: 521.10 Mbit/s
```

> To remove it later: edit `~/.bashrc` and delete the line containing `speedtest-cli`.

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
