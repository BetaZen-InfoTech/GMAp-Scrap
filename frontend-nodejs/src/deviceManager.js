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

// ── Registration ──────────────────────────────────────────────────────────────

async function registerDevice(nickname) {
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

  return res.data.deviceId;
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
 *  3. No device.json  →  call askFn for nickname  →  register  →  save
 *  4. Backend unreachable  →  warn and continue without a deviceId
 *
 * @param {Function} askFn  async (question) => string
 * @param {object}   chalk
 * @returns {string|null}
 */
async function ensureDevice(askFn, chalk) {
  const existing = loadDevice();

  if (existing?.deviceId) {
    process.stdout.write(chalk.cyan(
      `  Device: ${chalk.bold(existing.nickname || existing.deviceId.substring(0, 8))} — verifying…  `
    ));
    const ok = await verifyDevice(existing.deviceId);
    if (ok) {
      console.log(chalk.green('✓ Verified'));
      return existing.deviceId;
    }

    // Verify failed → re-register silently using the SAME saved nickname
    console.log(chalk.yellow('✗ Not found on server — re-registering with saved name…'));
    const savedNickname = existing.nickname || safeGet(() => os.hostname(), 'vps-host');
    return _register(savedNickname, chalk);
  }

  // First time — ask for nickname
  console.log(chalk.cyan('\n  Device registration (one-time setup)'));
  let nickname;
  try {
    nickname = await askFn('  Enter a nickname for this device (e.g. "VPS-1"): ');
  } catch {
    nickname = safeGet(() => os.hostname(), 'vps-host');
  }

  return _register(nickname || safeGet(() => os.hostname(), 'vps-host'), chalk);
}

async function _register(nickname, chalk) {
  try {
    const deviceId = await registerDevice(nickname);
    saveDevice({
      deviceId,
      nickname,
      registeredAt: new Date().toISOString(),
      host: safeGet(() => os.hostname(), 'unknown'),
    });
    console.log(chalk.green(`  ✓ Registered as "${nickname}"  (ID: ${deviceId.substring(0, 8)}…)`));
    return deviceId;
  } catch (err) {
    console.log(chalk.yellow(`  ⚠ Registration failed: ${err.message}`));
    console.log(chalk.yellow('  Continuing without a device ID'));
    return null;
  }
}

module.exports = { ensureDevice, loadDevice };
