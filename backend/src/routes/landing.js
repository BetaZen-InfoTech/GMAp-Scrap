const express = require('express');
const os = require('os');
const mongoose = require('mongoose');

const router = express.Router();

const APP_VERSION = require('../../package.json').version;
const NODE_VERSION = process.version;
const PROCESS_STARTED_AT = new Date();

const MONGO_STATE = ['disconnected', 'connected', 'connecting', 'disconnecting', 'uninitialized'];

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(2)} ${units[i]}`;
}

function formatSeconds(seconds) {
  const s = Math.floor(seconds);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h || d) parts.push(`${h}h`);
  if (m || h || d) parts.push(`${m}m`);
  parts.push(`${r}s`);
  return parts.join(' ');
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function snapshot() {
  const processMem = process.memoryUsage();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const cpus = os.cpus() || [];
  const loadavg = os.loadavg();
  const mongoState = MONGO_STATE[mongoose.connection.readyState] || 'unknown';

  return {
    app: {
      name: 'BetaZen G-Map Scraper Backend',
      version: APP_VERSION,
      state: process.env.APP_STATE || '—',
      nodeEnv: process.env.NODE_ENV || '—',
    },
    runtime: {
      node: NODE_VERSION,
      pid: process.pid,
      startedAt: PROCESS_STARTED_AT.toISOString(),
      uptime: formatSeconds(process.uptime()),
    },
    os: {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
      type: os.type(),
      uptime: formatSeconds(os.uptime()),
    },
    cpu: {
      model: cpus[0]?.model || '—',
      cores: cpus.length,
      speedMHz: cpus[0]?.speed || 0,
      load1: loadavg[0].toFixed(2),
      load5: loadavg[1].toFixed(2),
      load15: loadavg[2].toFixed(2),
    },
    memory: {
      processRss: formatBytes(processMem.rss),
      processHeapUsed: formatBytes(processMem.heapUsed),
      processHeapTotal: formatBytes(processMem.heapTotal),
      processExternal: formatBytes(processMem.external),
      systemTotal: formatBytes(totalMem),
      systemUsed: formatBytes(usedMem),
      systemFree: formatBytes(freeMem),
      systemUsedPct: totalMem ? +((usedMem / totalMem) * 100).toFixed(2) : 0,
      processHeapPct: processMem.heapTotal ? +((processMem.heapUsed / processMem.heapTotal) * 100).toFixed(2) : 0,
    },
    mongo: {
      state: mongoState,
      host: mongoose.connection.host || '—',
      name: mongoose.connection.name || '—',
    },
    timestamp: new Date().toISOString(),
  };
}

function render(data) {
  const { app, runtime, os: sysOs, cpu, memory, mongo, timestamp } = data;

  const mongoBadgeClass = mongo.state === 'connected' ? 'ok'
    : mongo.state === 'connecting' ? 'warn'
    : 'bad';

  const memBarClass = memory.systemUsedPct >= 90 ? 'bar-bad'
    : memory.systemUsedPct >= 75 ? 'bar-warn'
    : 'bar-ok';

  const heapBarClass = memory.processHeapPct >= 90 ? 'bar-bad'
    : memory.processHeapPct >= 75 ? 'bar-warn'
    : 'bar-ok';

  const e = escapeHtml;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${e(app.name)} — v${e(app.version)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #020617;
    --bg-grad-a: #0f172a;
    --bg-grad-b: #020617;
    --panel: rgba(15, 23, 42, 0.75);
    --panel-border: rgba(51, 65, 85, 0.6);
    --text: #e2e8f0;
    --text-dim: #94a3b8;
    --text-dimmer: #64748b;
    --accent: #60a5fa;
    --accent-bg: rgba(59, 130, 246, 0.12);
    --ok: #34d399;
    --ok-bg: rgba(16, 185, 129, 0.15);
    --warn: #fbbf24;
    --warn-bg: rgba(234, 179, 8, 0.15);
    --bad: #f87171;
    --bad-bg: rgba(239, 68, 68, 0.15);
  }
  body {
    min-height: 100vh;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', Roboto, sans-serif;
    background: radial-gradient(ellipse at top, var(--bg-grad-a), var(--bg-grad-b));
    color: var(--text);
    padding: 32px 20px 48px;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 1120px; margin: 0 auto; }
  header {
    display: flex; align-items: center; justify-content: space-between;
    flex-wrap: wrap; gap: 16px;
    padding-bottom: 24px;
    border-bottom: 1px solid var(--panel-border);
    margin-bottom: 28px;
  }
  .logo {
    display: flex; align-items: center; gap: 14px;
  }
  .logo-mark {
    width: 44px; height: 44px;
    border-radius: 12px;
    background: linear-gradient(135deg, #3b82f6, #8b5cf6);
    display: flex; align-items: center; justify-content: center;
    color: white; font-weight: 700; font-size: 22px;
    box-shadow: 0 6px 20px rgba(59, 130, 246, 0.4);
  }
  .logo h1 {
    font-size: 20px; font-weight: 700; letter-spacing: -0.01em;
  }
  .logo .subtitle {
    font-size: 13px; color: var(--text-dim); margin-top: 2px;
  }
  .pills { display: flex; gap: 8px; flex-wrap: wrap; }
  .pill {
    padding: 6px 12px; border-radius: 999px;
    font-size: 12px; font-weight: 500;
    background: var(--accent-bg); color: var(--accent);
    border: 1px solid rgba(59, 130, 246, 0.25);
  }
  .pill.ok   { background: var(--ok-bg);   color: var(--ok);   border-color: rgba(16, 185, 129, 0.35); }
  .pill.warn { background: var(--warn-bg); color: var(--warn); border-color: rgba(234, 179, 8, 0.35); }
  .pill.bad  { background: var(--bad-bg);  color: var(--bad);  border-color: rgba(239, 68, 68, 0.35); }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 16px;
    margin-bottom: 20px;
  }
  .card {
    background: var(--panel);
    border: 1px solid var(--panel-border);
    border-radius: 14px;
    padding: 18px 20px;
    backdrop-filter: blur(10px);
    transition: border-color 0.2s;
  }
  .card:hover { border-color: rgba(96, 165, 250, 0.4); }
  .card h2 {
    font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em;
    color: var(--text-dim);
    margin-bottom: 14px;
    display: flex; align-items: center; gap: 8px;
  }
  .card h2 .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }
  .card h2.ok .dot { background: var(--ok); }
  .card h2.warn .dot { background: var(--warn); }
  .card h2.bad .dot { background: var(--bad); }

  .kv { display: flex; flex-direction: column; gap: 10px; }
  .kv-row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
  .kv-key { font-size: 12px; color: var(--text-dim); }
  .kv-val { font-size: 14px; color: var(--text); font-weight: 500; font-variant-numeric: tabular-nums; text-align: right; word-break: break-word; }
  .kv-val.mono { font-family: 'SF Mono', 'Menlo', 'Consolas', monospace; font-size: 13px; }

  .big-stat {
    font-size: 32px; font-weight: 700; letter-spacing: -0.02em;
    color: var(--text); line-height: 1;
    margin-bottom: 6px;
    font-variant-numeric: tabular-nums;
  }
  .big-stat-label { font-size: 12px; color: var(--text-dim); }

  .bar-wrap { margin-top: 12px; }
  .bar-top { display: flex; justify-content: space-between; font-size: 12px; color: var(--text-dim); margin-bottom: 6px; }
  .bar-track {
    height: 8px; border-radius: 999px; overflow: hidden;
    background: rgba(51, 65, 85, 0.5);
  }
  .bar-fill { height: 100%; border-radius: 999px; transition: width 0.4s ease; }
  .bar-ok   { background: linear-gradient(90deg, #10b981, #34d399); }
  .bar-warn { background: linear-gradient(90deg, #f59e0b, #fbbf24); }
  .bar-bad  { background: linear-gradient(90deg, #ef4444, #f87171); }

  footer {
    margin-top: 28px; padding-top: 20px;
    border-top: 1px solid var(--panel-border);
    display: flex; justify-content: space-between; align-items: center;
    flex-wrap: wrap; gap: 12px;
    font-size: 12px; color: var(--text-dimmer);
  }
  .refresh-btn {
    background: var(--accent-bg); color: var(--accent);
    border: 1px solid rgba(59, 130, 246, 0.3);
    padding: 8px 14px; border-radius: 8px;
    font-size: 12px; font-weight: 500;
    cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
    transition: all 0.15s;
    font-family: inherit;
  }
  .refresh-btn:hover { background: rgba(59, 130, 246, 0.22); border-color: rgba(59, 130, 246, 0.5); }
  .refresh-btn:active { transform: translateY(1px); }
  .refresh-btn.spin svg { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  a.link { color: var(--accent); text-decoration: none; }
  a.link:hover { text-decoration: underline; }

  @media (max-width: 600px) {
    body { padding: 20px 12px 32px; }
    .big-stat { font-size: 26px; }
  }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <div class="logo">
        <div class="logo-mark">B</div>
        <div>
          <h1>${e(app.name)}</h1>
          <div class="subtitle">Version ${e(app.version)} · Node ${e(runtime.node)}</div>
        </div>
      </div>
      <div class="pills">
        <span class="pill ${app.state === 'prod' ? 'warn' : 'ok'}">state: ${e(app.state)}</span>
        <span class="pill">${e(app.nodeEnv)}</span>
        <span class="pill ${mongoBadgeClass}">mongo: ${e(mongo.state)}</span>
      </div>
    </header>

    <div class="grid">
      <div class="card">
        <h2 class="ok"><span class="dot"></span>Uptime</h2>
        <div class="big-stat" id="processUptime">${e(runtime.uptime)}</div>
        <div class="big-stat-label">process</div>
        <div class="kv" style="margin-top: 14px">
          <div class="kv-row"><span class="kv-key">system uptime</span><span class="kv-val">${e(sysOs.uptime)}</span></div>
          <div class="kv-row"><span class="kv-key">started at</span><span class="kv-val mono" style="font-size:11px">${e(runtime.startedAt)}</span></div>
        </div>
      </div>

      <div class="card">
        <h2 class="${memBarClass === 'bar-bad' ? 'bad' : memBarClass === 'bar-warn' ? 'warn' : 'ok'}"><span class="dot"></span>System memory</h2>
        <div class="big-stat">${memory.systemUsedPct}<span style="font-size:18px;color:var(--text-dim)">%</span></div>
        <div class="big-stat-label">${e(memory.systemUsed)} of ${e(memory.systemTotal)} used</div>
        <div class="bar-wrap">
          <div class="bar-top">
            <span>used</span><span>free ${e(memory.systemFree)}</span>
          </div>
          <div class="bar-track"><div class="bar-fill ${memBarClass}" style="width: ${memory.systemUsedPct}%"></div></div>
        </div>
      </div>

      <div class="card">
        <h2 class="${heapBarClass === 'bar-bad' ? 'bad' : heapBarClass === 'bar-warn' ? 'warn' : 'ok'}"><span class="dot"></span>Process memory</h2>
        <div class="big-stat">${e(memory.processRss)}</div>
        <div class="big-stat-label">rss · heap ${e(memory.processHeapUsed)} / ${e(memory.processHeapTotal)}</div>
        <div class="bar-wrap">
          <div class="bar-top">
            <span>heap used</span><span>${memory.processHeapPct}%</span>
          </div>
          <div class="bar-track"><div class="bar-fill ${heapBarClass}" style="width: ${memory.processHeapPct}%"></div></div>
        </div>
      </div>

      <div class="card">
        <h2><span class="dot"></span>CPU</h2>
        <div class="big-stat">${e(cpu.cores)} <span style="font-size:16px;color:var(--text-dim);font-weight:500">cores</span></div>
        <div class="big-stat-label" style="font-size:11px">${e(cpu.model)}</div>
        <div class="kv" style="margin-top: 14px">
          <div class="kv-row"><span class="kv-key">base speed</span><span class="kv-val">${e(cpu.speedMHz)} MHz</span></div>
          <div class="kv-row"><span class="kv-key">load avg</span><span class="kv-val mono">${e(cpu.load1)} · ${e(cpu.load5)} · ${e(cpu.load15)}</span></div>
        </div>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <h2><span class="dot"></span>Runtime</h2>
        <div class="kv">
          <div class="kv-row"><span class="kv-key">Node.js</span><span class="kv-val mono">${e(runtime.node)}</span></div>
          <div class="kv-row"><span class="kv-key">process id</span><span class="kv-val mono">${e(runtime.pid)}</span></div>
          <div class="kv-row"><span class="kv-key">app version</span><span class="kv-val mono">${e(app.version)}</span></div>
          <div class="kv-row"><span class="kv-key">app state</span><span class="kv-val">${e(app.state)}</span></div>
          <div class="kv-row"><span class="kv-key">node env</span><span class="kv-val">${e(app.nodeEnv)}</span></div>
        </div>
      </div>

      <div class="card">
        <h2><span class="dot"></span>Host</h2>
        <div class="kv">
          <div class="kv-row"><span class="kv-key">hostname</span><span class="kv-val mono" style="font-size:12px">${e(sysOs.hostname)}</span></div>
          <div class="kv-row"><span class="kv-key">platform</span><span class="kv-val">${e(sysOs.platform)} (${e(sysOs.arch)})</span></div>
          <div class="kv-row"><span class="kv-key">os type</span><span class="kv-val">${e(sysOs.type)}</span></div>
          <div class="kv-row"><span class="kv-key">kernel</span><span class="kv-val mono" style="font-size:12px">${e(sysOs.release)}</span></div>
        </div>
      </div>

      <div class="card">
        <h2 class="${mongoBadgeClass}"><span class="dot"></span>MongoDB</h2>
        <div class="kv">
          <div class="kv-row"><span class="kv-key">state</span><span class="kv-val" style="text-transform:capitalize">${e(mongo.state)}</span></div>
          <div class="kv-row"><span class="kv-key">host</span><span class="kv-val mono" style="font-size:12px">${e(mongo.host)}</span></div>
          <div class="kv-row"><span class="kv-key">database</span><span class="kv-val mono" style="font-size:12px">${e(mongo.name)}</span></div>
        </div>
      </div>
    </div>

    <footer>
      <div>Last refreshed: <span id="ts">${e(timestamp)}</span></div>
      <button class="refresh-btn" id="refreshBtn" onclick="refreshNow()">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="23 4 23 10 17 10"></polyline>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
        </svg>
        Refresh
      </button>
    </footer>
  </div>

<script>
  async function refreshNow() {
    const btn = document.getElementById('refreshBtn');
    btn.classList.add('spin');
    try {
      // Re-fetch the page so server re-renders with current data.
      const res = await fetch(window.location.href, { headers: { Accept: 'text/html' } });
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const newWrap = doc.querySelector('.wrap');
      if (newWrap) {
        document.querySelector('.wrap').innerHTML = newWrap.innerHTML;
      }
    } catch (e) {
      console.error('Refresh failed:', e);
    } finally {
      // Need to re-bind because we replaced the DOM
      const newBtn = document.getElementById('refreshBtn');
      if (newBtn) newBtn.classList.remove('spin');
    }
  }
  // Auto refresh every 30s
  setInterval(refreshNow, 30_000);
</script>
</body>
</html>`;
}

/** GET / — dashboard-style HTML page rendering current server details. */
router.get('/', (_req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(render(snapshot()));
});

module.exports = router;
