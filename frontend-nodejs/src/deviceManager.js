'use strict';

const axios  = require('axios');
const os     = require('os');
const fs     = require('fs');
const path   = require('path');
const { API_BASE_URL } = require('./config');

const DEVICE_FILE  = path.join(__dirname, '..', 'device.json');
const REG_PASSWORD = 'BetaZen@2023';

// ── Persist / load ────────────────────────────────────────────────────────────

function loadDevice() {
  try {
    if (fs.existsSync(DEVICE_FILE)) {
      return JSON.parse(fs.readFileSync(DEVICE_FILE, 'utf8'));
    }
  } catch { /* ignore */ }
  return null;
}

function saveDevice(data) {
  fs.writeFileSync(DEVICE_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// ── Network helpers ───────────────────────────────────────────────────────────

function getDeviceIp() {
  try {
    const interfaces = os.networkInterfaces();
    for (const iface of Object.values(interfaces)) {
      for (const entry of (iface || [])) {
        if (!entry.internal && entry.family === 'IPv4') {
          return entry.address;
        }
      }
    }
  } catch { /* ignore */ }
  return null;
}

async function updateNickname(deviceId, nickname) {
  try {
    await axios.patch(
      `${API_BASE_URL}/api/devices/${deviceId}/nickname`,
      { nickname },
      { timeout: 10000 }
    );
  } catch { /* non-fatal */ }
}

// ── System info (VPS-safe: every call wrapped in try/catch) ───────────────────

function safeGet(fn, fallback = 'unknown') {
  try { return fn(); } catch { return fallback; }
}

function buildDeviceInfo() {
  const macAddresses = [];
  try {
    const interfaces = os.networkInterfaces();
    for (const iface of Object.values(interfaces)) {
      for (const entry of (iface || [])) {
        if (!entry.internal && entry.mac && entry.mac !== '00:00:00:00:00:00') {
          macAddresses.push(entry.mac);
        }
      }
    }
  } catch { /* VPS may not expose MAC */ }

  return {
    hostname:      safeGet(() => os.hostname(),              'vps-host'),
    username:      safeGet(() => os.userInfo().username,     'root'),
    platform:      safeGet(() => os.platform(),              'linux'),
    osVersion:     safeGet(() => os.release(),               'unknown'),
    arch:          safeGet(() => os.arch(),                  'x64'),
    cpuModel:      safeGet(() => os.cpus()[0]?.model,        'Unknown CPU'),
    cpuCores:      safeGet(() => os.cpus().length,           1),
    totalMemoryGB: safeGet(() => parseFloat((os.totalmem() / 1073741824).toFixed(2)), 0),
    macAddresses,
  };
}

async function verifyDevice(deviceId) {
  try {
    const res = await axios.post(
      `${API_BASE_URL}/api/devices/verify`,
      { deviceId },
      { timeout: 10000 }
    );
    return res.data?.success === true;
  } catch {
    return false;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Ensures this machine has a registered deviceId.
 *
 * Flow:
 *  1. Load device.json  →  verify with backend  →  use it              (fast path)
 *  2. device.json exists but verify fails  →  re-register with SAVED nickname (no prompt)
 *  3. No device.json  →  use overrideNickname or os.hostname()  →  register  →  save
 *  4. Backend unreachable  →  warn and continue without a deviceId
 *
 * @param {object}  chalk
 * @param {string}  [overrideNickname]  CLI-provided hostname (optional)
 * @returns {string|null}
 */
async function ensureDevice(chalk, overrideNickname) {
  const existing = loadDevice();

  const deviceIp = getDeviceIp();

  if (existing?.deviceId) {
    process.stdout.write(chalk.cyan(
      `  Device: ${chalk.bold(existing.nickname || existing.deviceId.substring(0, 8))} — verifying…  `
    ));
    const ok = await verifyDevice(existing.deviceId);
    if (ok) {
      console.log(chalk.green('✓ Verified'));
      return existing.deviceId;
    }

    // Verify failed → re-register silently using IP (or saved name fallback)
    console.log(chalk.yellow('✗ Not found on server — re-registering…'));
    const savedNickname = deviceIp || existing.nickname || overrideNickname || safeGet(() => os.hostname(), 'vps-host');
    return _register(savedNickname, chalk);
  }

  // First time — use IP or CLI arg or hostname
  const nickname = deviceIp || overrideNickname || safeGet(() => os.hostname(), 'vps-host');
  console.log(chalk.cyan(`\n  Device registration (one-time setup) — name: ${nickname}`));
  return _register(nickname, chalk);
}

async function _register(nickname, chalk) {
  try {
    const res = await axios.post(
      `${API_BASE_URL}/api/devices/register`,
      {
        password:   REG_PASSWORD,
        nickname:   String(nickname).trim(),
        deviceInfo: buildDeviceInfo(),
      },
      { timeout: 15000 }
    );

    if (!res.data?.success || !res.data?.deviceId) {
      throw new Error(res.data?.error || 'Registration failed');
    }

    const deviceId = res.data.deviceId;
    saveDevice({
      deviceId,
      nickname,
      registeredAt: new Date().toISOString(),
      host: safeGet(() => os.hostname(), 'unknown'),
    });

    if (res.data.existing) {
      console.log(chalk.cyan(`  ✓ IP already registered — using device "${res.data.message}" (ID: ${deviceId.substring(0, 8)}…)`));
    } else {
      console.log(chalk.green(`  ✓ Registered as "${nickname}"  (ID: ${deviceId.substring(0, 8)}…)`));
    }
    return deviceId;
  } catch (err) {
    const msg = err.response?.data?.error || err.message;
    console.log(chalk.yellow(`  ⚠ Registration failed: ${msg}`));
    console.log(chalk.yellow('  Continuing without a device ID'));
    return null;
  }
}

module.exports = { ensureDevice, loadDevice };
