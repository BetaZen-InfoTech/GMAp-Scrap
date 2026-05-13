'use strict';

const os     = require('os');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const Device = require('./models/Device');

const DEVICE_FILE = path.join(__dirname, '..', 'device.json');

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
  // Atomic write — when multiple PM2 processes start in parallel on the same
  // VPS, they all call ensureDevice() and may race on this file. Write to a
  // per-pid temp file first, then rename (POSIX-atomic).
  const json = JSON.stringify(data, null, 2);
  const tmp  = `${DEVICE_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, json, 'utf8');
  try {
    fs.renameSync(tmp, DEVICE_FILE);
  } catch (_err) {
    try { fs.unlinkSync(tmp); } catch (_) { /* ignore */ }
    fs.writeFileSync(DEVICE_FILE, json, 'utf8');
  }
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

// ── System info (VPS-safe) ────────────────────────────────────────────────────

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

/**
 * Verify a device exists, update its lastSeenAt + status, top up missing
 * spec fields. Mirrors the old POST /api/devices/verify route.
 */
async function verifyDevice(deviceId) {
  try {
    const device = await Device.findOne({ deviceId, isActive: true });
    if (!device) return false;

    device.lastSeenAt = new Date();
    device.status = 'online';
    if (device.isArchived) {
      device.isArchived = false;
      device.archivedAt = null;
    }

    const info = buildDeviceInfo();
    if (info.hostname && (!device.hostname || device.hostname === 'Pending setup')) device.hostname = info.hostname;
    if (info.username) device.username = info.username;
    if (info.platform && device.platform === 'unknown') device.platform = info.platform;
    if (info.osVersion) device.osVersion = info.osVersion;
    if (info.arch) device.arch = info.arch;
    if (info.cpuModel && (!device.cpuModel || device.cpuModel === 'Unknown CPU')) device.cpuModel = info.cpuModel;
    if (info.cpuCores && !device.cpuCores) device.cpuCores = info.cpuCores;
    if (info.totalMemoryGB && !device.totalMemoryGB) device.totalMemoryGB = info.totalMemoryGB;
    if (info.macAddresses?.length && (!device.macAddresses || device.macAddresses.length === 0)) device.macAddresses = info.macAddresses;

    const currentIp = getDeviceIp();
    if (currentIp && !device.ips.includes(currentIp)) {
      device.ips.push(currentIp);
    }

    await device.save();
    return true;
  } catch {
    return false;
  }
}

/**
 * Register a new device, or return the existing device that owns this IP.
 * Mirrors the old POST /api/devices/register route — IP-based dedup so
 * re-running the CLI on a known VPS doesn't create duplicate Device docs.
 */
async function registerDevice(nickname) {
  const info = buildDeviceInfo();
  const deviceIp = getDeviceIp();

  if (deviceIp) {
    const existing = await Device.findOne({
      isActive: true,
      $or: [{ ip: deviceIp }, { ips: deviceIp }],
    });
    if (existing) {
      if (nickname?.trim() && nickname.trim() !== existing.nickname) {
        existing.nickname = nickname.trim();
      }
      if (info.hostname) existing.hostname = info.hostname;
      if (info.username) existing.username = info.username;
      if (info.platform) existing.platform = info.platform;
      if (info.osVersion) existing.osVersion = info.osVersion;
      if (info.arch) existing.arch = info.arch;
      if (info.cpuModel) existing.cpuModel = info.cpuModel;
      if (info.cpuCores) existing.cpuCores = info.cpuCores;
      if (info.totalMemoryGB) existing.totalMemoryGB = info.totalMemoryGB;
      if (info.macAddresses?.length) existing.macAddresses = info.macAddresses;
      existing.lastSeenAt = new Date();
      existing.status = 'online';
      await existing.save();
      return {
        deviceId: existing.deviceId,
        existing: true,
        message: existing.nickname || existing.deviceId.slice(0, 8),
      };
    }
  }

  const deviceId = crypto.randomUUID();
  const device = new Device({
    deviceId,
    nickname: nickname?.trim() || '',
    hostname: info.hostname,
    username: info.username,
    platform: info.platform,
    osVersion: info.osVersion,
    arch: info.arch,
    cpuModel: info.cpuModel,
    cpuCores: info.cpuCores,
    totalMemoryGB: info.totalMemoryGB,
    macAddresses: info.macAddresses || [],
    ip: deviceIp || '',
    ips: deviceIp ? [deviceIp] : [],
    status: 'online',
    lastSeenAt: new Date(),
  });
  await device.save();
  return { deviceId, existing: false };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Ensures this machine has a registered deviceId. Flow:
 *  1. Load device.json → verify against MongoDB → use it                 (fast path)
 *  2. device.json exists but verify fails → re-register using SAVED nickname
 *  3. No device.json → use overrideNickname or os.hostname() → register → save
 *  4. MongoDB unreachable → warn and continue without a deviceId
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

    console.log(chalk.yellow('✗ Not found on DB — re-registering…'));
    const savedNickname = deviceIp || existing.nickname || overrideNickname || safeGet(() => os.hostname(), 'vps-host');
    return _register(savedNickname, chalk);
  }

  const nickname = deviceIp || overrideNickname || safeGet(() => os.hostname(), 'vps-host');
  console.log(chalk.cyan(`\n  Device registration (one-time setup) — name: ${nickname}`));
  return _register(nickname, chalk);
}

async function _register(nickname, chalk) {
  try {
    const result = await registerDevice(String(nickname).trim());
    saveDevice({
      deviceId: result.deviceId,
      nickname,
      registeredAt: new Date().toISOString(),
      host: safeGet(() => os.hostname(), 'unknown'),
    });

    if (result.existing) {
      console.log(chalk.cyan(`  ✓ IP already registered — using device "${result.message}" (ID: ${result.deviceId.substring(0, 8)}…)`));
    } else {
      console.log(chalk.green(`  ✓ Registered as "${nickname}"  (ID: ${result.deviceId.substring(0, 8)}…)`));
    }
    return result.deviceId;
  } catch (err) {
    console.log(chalk.yellow(`  ⚠ Registration failed: ${err.message}`));
    console.log(chalk.yellow('  Continuing without a device ID'));
    return null;
  }
}

module.exports = { ensureDevice, loadDevice };
