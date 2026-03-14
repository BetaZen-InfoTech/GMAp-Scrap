'use strict';

const axios  = require('axios');
const os     = require('os');
const fs     = require('fs');
const path   = require('path');
const { API_BASE_URL } = require('./config');

const DEVICE_FILE       = path.join(__dirname, '..', 'device.json');
const REG_PASSWORD      = 'BetaZen@2023';

// ── Persist / load ─────────────────────────────────────────────────────────

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

// ── System info ─────────────────────────────────────────────────────────────

function buildDeviceInfo() {
  const interfaces = os.networkInterfaces();
  const macAddresses = [];
  for (const iface of Object.values(interfaces)) {
    for (const entry of (iface || [])) {
      if (!entry.internal && entry.mac && entry.mac !== '00:00:00:00:00:00') {
        macAddresses.push(entry.mac);
      }
    }
  }
  return {
    hostname:        os.hostname(),
    username:        os.userInfo().username,
    platform:        os.platform(),
    osVersion:       os.release(),
    arch:            os.arch(),
    cpuModel:        os.cpus()[0]?.model || 'Unknown',
    cpuCores:        os.cpus().length,
    totalMemoryGB:   parseFloat((os.totalmem() / 1073741824).toFixed(2)),
    macAddresses,
  };
}

// ── Registration ────────────────────────────────────────────────────────────

async function registerDevice(nickname) {
  const res = await axios.post(
    `${API_BASE_URL}/api/devices/register`,
    {
      password:   REG_PASSWORD,
      nickname:   nickname.trim(),
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

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Ensures this machine has a registered deviceId.
 *
 * Flow:
 *  1. Load from device.json  →  verify with backend  →  use it
 *  2. If missing or invalid  →  ask for nickname     →  register  →  save
 *  3. If backend unreachable →  warn and continue without a deviceId
 *
 * @param {Function} askFn  async (question) => string  (readline helper)
 * @param {object}   chalk  chalk instance for coloring output
 * @returns {string|null}  deviceId or null
 */
async function ensureDevice(askFn, chalk) {
  const existing = loadDevice();

  if (existing?.deviceId) {
    process.stdout.write(chalk.cyan(`  Verifying device (${existing.deviceId.substring(0, 8)}…)  `));
    const ok = await verifyDevice(existing.deviceId);
    if (ok) {
      console.log(chalk.green('✓ Device recognised'));
      return existing.deviceId;
    }
    console.log(chalk.yellow('✗ Device not found on server — re-registering…'));
  }

  // Need to register
  console.log(chalk.cyan('\n  Device registration (one-time setup)'));
  let nickname;
  try {
    nickname = await askFn('  Enter a nickname for this device (e.g. "Office PC 1"): ');
  } catch {
    nickname = os.hostname();
  }

  try {
    const deviceId = await registerDevice(nickname || os.hostname());
    saveDevice({ deviceId, nickname: nickname || os.hostname(), registeredAt: new Date().toISOString() });
    console.log(chalk.green(`  ✓ Registered! Device ID: ${deviceId.substring(0, 8)}…`));
    return deviceId;
  } catch (err) {
    console.log(chalk.yellow(`  ⚠ Registration failed: ${err.message}`));
    console.log(chalk.yellow('  Continuing without a device ID (data saved as "Unregistered Device")'));
    return null;
  }
}

module.exports = { ensureDevice, loadDevice };
