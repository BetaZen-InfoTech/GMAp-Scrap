const Device = require('../models/Device');
const { startCron } = require('../utils/cronRunner');

const OFFLINE_THRESHOLD_MS = 2.55 * 60 * 1000; // 2 min 33 sec
const CHECK_INTERVAL_MS    = 3   * 60 * 1000;   // run every 3 minutes

/**
 * Single offline-check run: marks online devices whose lastSeenAt
 * is older than OFFLINE_THRESHOLD_MS as 'offline'.
 */
async function runOfflineCheck() {
  const cutoff = new Date(Date.now() - OFFLINE_THRESHOLD_MS);

  const result = await Device.updateMany(
    { status: 'online', lastSeenAt: { $lt: cutoff } },
    { $set: { status: 'offline' } }
  );

  if (result.modifiedCount > 0) {
    console.log(
      `[DeviceCron] ${new Date().toISOString()} — marked ${result.modifiedCount} device(s) offline (cutoff: ${cutoff.toISOString()})`
    );
  } else {
    console.log(
      `[DeviceCron] ${new Date().toISOString()} — check done, no devices went offline`
    );
  }
}

function startDeviceOfflineCron() {
  console.log('[DeviceCron] Starting — threshold: 2.55 min, interval: every 3 min');
  return startCron({
    name: 'DeviceCron',
    intervalMs: CHECK_INTERVAL_MS,
    task: runOfflineCheck,
  });
}

module.exports = { startDeviceOfflineCron, runOfflineCheck };
