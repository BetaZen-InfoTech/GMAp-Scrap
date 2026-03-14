'use strict';

const si    = require('systeminformation');
const axios = require('axios');
const { API_BASE_URL } = require('./config');

// Previous network sample for speed calculation
let _prevNetRx   = 0;
let _prevNetTx   = 0;
let _prevNetTime = 0;

// ── Stats reader ──────────────────────────────────────────────────────────────

async function getSystemStats() {
  try {
    const [cpu, mem, disks, nets] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.networkStats(),
    ]);

    const cpuUsed        = Math.round(cpu.currentLoad);
    const ramTotalMB     = Math.round(mem.total / 1048576);
    const ramUsedMB      = Math.round((mem.total - mem.available) / 1048576);
    const ramUsedPercent = ramTotalMB > 0 ? Math.round((ramUsedMB / ramTotalMB) * 100) : 0;

    const mainDisk        = (disks || []).sort((a, b) => (b.size || 0) - (a.size || 0))[0] || {};
    const diskTotalGB     = parseFloat(((mainDisk.size || 0) / 1073741824).toFixed(1));
    const diskUsedGB      = parseFloat(((mainDisk.used || 0) / 1073741824).toFixed(1));
    const diskUsedPercent = mainDisk.use != null ? Math.round(mainDisk.use) : 0;

    const now = Date.now();
    let netDownKBps = 0, netUpKBps = 0, netTotalRecvMB = 0, netTotalSentMB = 0;

    if (nets && nets.length > 0) {
      const totalRx = nets.reduce((s, n) => s + (n.rx_bytes || 0), 0);
      const totalTx = nets.reduce((s, n) => s + (n.tx_bytes || 0), 0);
      netTotalRecvMB = parseFloat((totalRx / 1048576).toFixed(1));
      netTotalSentMB = parseFloat((totalTx / 1048576).toFixed(1));
      if (_prevNetTime > 0) {
        const elapsed = (now - _prevNetTime) / 1000;
        if (elapsed > 0) {
          netDownKBps = Math.max(0, Math.round((totalRx - _prevNetRx) / elapsed / 1024));
          netUpKBps   = Math.max(0, Math.round((totalTx - _prevNetTx) / elapsed / 1024));
        }
      }
      _prevNetRx = totalRx; _prevNetTx = totalTx; _prevNetTime = now;
    }

    return {
      cpuUsed, ramTotalMB, ramUsedMB, ramUsedPercent,
      diskTotalGB, diskUsedGB, diskUsedPercent,
      netDownKBps, netUpKBps, netTotalRecvMB, netTotalSentMB,
    };
  } catch {
    return {
      cpuUsed: 0, ramTotalMB: 0, ramUsedMB: 0, ramUsedPercent: 0,
      diskTotalGB: 0, diskUsedGB: 0, diskUsedPercent: 0,
      netDownKBps: 0, netUpKBps: 0, netTotalRecvMB: 0, netTotalSentMB: 0,
    };
  }
}

function fmtSpeed(kbps) {
  return kbps >= 1024 ? `${(kbps / 1024).toFixed(1)} MB/s` : `${kbps} KB/s`;
}
function fmtSize(mb) {
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb} MB`;
}

// ── Server upload (batched) ───────────────────────────────────────────────────

async function flushStatsToServer(deviceId, statsBuffer) {
  if (!deviceId || statsBuffer.length === 0) return;
  try {
    await axios.post(
      `${API_BASE_URL}/api/device-history`,
      { deviceId, stats: statsBuffer },
      { timeout: 10000 }
    );
  } catch { /* fire-and-forget */ }
}

// ── LiveMonitor ───────────────────────────────────────────────────────────────

/**
 * Live stats bar that:
 *  - Overwrites itself in-place every `intervalMs` (default 2 s)
 *  - Batches snapshots and uploads to /api/device-history every 30 s
 *
 * Usage:
 *   const monitor = new LiveMonitor();
 *   await monitor.start(chalk, deviceId, 2000);
 *   monitor.print('any message');    // prints above bar, bar stays at bottom
 *   monitor.writeProgress('text');   // temp text on bar line
 *   monitor.stop();
 */
class LiveMonitor {
  constructor() {
    this.active      = false;
    this.interval    = null;
    this.lastLine    = '';
    this._chalk      = null;
    this._deviceId   = null;
    this._buffer     = [];
    this._flushTimer = null;
    this._FLUSH_EVERY = 15;   // ~30 s at 2 s interval
  }

  async start(chalk, deviceId, intervalMs = 2000) {
    this._chalk    = chalk;
    this._deviceId = deviceId || null;
    this.active    = true;
    await this._render();
    this.interval    = setInterval(() => this._render(), intervalMs);
    this._flushTimer = setInterval(() => this._flush(), 30_000);
  }

  stop() {
    this.active = false;
    if (this.interval)    { clearInterval(this.interval);    this.interval    = null; }
    if (this._flushTimer) { clearInterval(this._flushTimer); this._flushTimer = null; }
    process.stdout.write('\r\x1b[2K');
    this._flush();  // send remaining snapshots on exit
  }

  /** Print a message above the live bar. Use instead of console.log. */
  print(...args) {
    process.stdout.write('\r\x1b[2K');
    console.log(...args);
    if (this.active && this.lastLine) process.stdout.write(this.lastLine);
  }

  /** Temporarily replace the bar with a short progress string (no newline). */
  writeProgress(text) {
    process.stdout.write('\r\x1b[2K' + text);
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  async _render() {
    if (!this.active) return;
    try {
      const s       = await getSystemStats();
      this.lastLine = this._format(s);
      process.stdout.write('\r\x1b[2K' + this.lastLine);

      // Buffer for server upload
      this._buffer.push({
        timestamp:       new Date().toISOString(),
        cpuUsedPercent:  s.cpuUsed,
        ramTotalMB:      s.ramTotalMB,
        ramUsedMB:       s.ramUsedMB,
        ramUsedPercent:  s.ramUsedPercent,
        diskTotalGB:     s.diskTotalGB,
        diskUsedGB:      s.diskUsedGB,
        diskUsedPercent: s.diskUsedPercent,
        networkSentMB:   s.netTotalSentMB,
        networkRecvMB:   s.netTotalRecvMB,
        netDownKBps:     s.netDownKBps,
        netUpKBps:       s.netUpKBps,
      });

      if (this._buffer.length >= this._FLUSH_EVERY) this._flush();
    } catch { /* ignore */ }
  }

  _flush() {
    if (this._buffer.length === 0) return;
    const batch = this._buffer.splice(0);
    flushStatsToServer(this._deviceId, batch);
  }

  _format(s) {
    const c    = this._chalk;
    const time = new Date().toLocaleTimeString('en-GB');
    return c.bgBlue.white(
      ` ${time} | ` +
      `CPU: ${s.cpuUsed}% | ` +
      `RAM: ${s.ramUsedMB}/${s.ramTotalMB} MB (${s.ramUsedPercent}%) | ` +
      `Disk: ${s.diskUsedGB}/${s.diskTotalGB} GB (${s.diskUsedPercent}%) | ` +
      `Net: ↓${fmtSpeed(s.netDownKBps)} ↑${fmtSpeed(s.netUpKBps)} | ` +
      `Data: ↓${fmtSize(s.netTotalRecvMB)} ↑${fmtSize(s.netTotalSentMB)} `
    );
  }
}

module.exports = { getSystemStats, LiveMonitor };
