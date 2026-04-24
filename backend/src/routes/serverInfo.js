const express = require('express');
const os = require('os');
const mongoose = require('mongoose');

const router = express.Router();

const APP_VERSION = require('../../package.json').version;
const NODE_VERSION = process.version;
const PROCESS_STARTED_AT = new Date();

/** Map mongoose readyState codes to human labels. */
const MONGO_STATE = ['disconnected', 'connected', 'connecting', 'disconnecting', 'uninitialized'];

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return null;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
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

/**
 * GET /api/server-info
 * Returns version, runtime, OS, memory, CPU, process, and MongoDB
 * connection details for monitoring / diagnostics.
 */
router.get('/', (_req, res) => {
  const processMem = process.memoryUsage();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const cpus = os.cpus() || [];
  const loadavg = os.loadavg();
  const mongoState = MONGO_STATE[mongoose.connection.readyState] || 'unknown';

  res.json({
    app: {
      name: 'BetaZen G-Map Scraper Backend',
      version: APP_VERSION,
      state: process.env.APP_STATE || null,
      nodeEnv: process.env.NODE_ENV || null,
    },
    runtime: {
      node: NODE_VERSION,
      pid: process.pid,
      startedAt: PROCESS_STARTED_AT.toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      uptime: formatSeconds(process.uptime()),
    },
    os: {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
      type: os.type(),
      uptimeSeconds: Math.round(os.uptime()),
      uptime: formatSeconds(os.uptime()),
    },
    cpu: {
      model: cpus[0]?.model || null,
      cores: cpus.length,
      speedMHz: cpus[0]?.speed || null,
      loadAverage: { '1m': loadavg[0], '5m': loadavg[1], '15m': loadavg[2] },
    },
    memory: {
      process: {
        rss: processMem.rss,
        rssFormatted: formatBytes(processMem.rss),
        heapTotal: processMem.heapTotal,
        heapTotalFormatted: formatBytes(processMem.heapTotal),
        heapUsed: processMem.heapUsed,
        heapUsedFormatted: formatBytes(processMem.heapUsed),
        external: processMem.external,
        externalFormatted: formatBytes(processMem.external),
        arrayBuffers: processMem.arrayBuffers,
        arrayBuffersFormatted: formatBytes(processMem.arrayBuffers),
      },
      system: {
        total: totalMem,
        totalFormatted: formatBytes(totalMem),
        free: freeMem,
        freeFormatted: formatBytes(freeMem),
        used: usedMem,
        usedFormatted: formatBytes(usedMem),
        usagePercent: totalMem ? +((usedMem / totalMem) * 100).toFixed(2) : null,
      },
    },
    mongo: {
      state: mongoState,
      host: mongoose.connection.host || null,
      name: mongoose.connection.name || null,
    },
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
