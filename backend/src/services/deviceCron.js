const Device = require('../models/Device');

const OFFLINE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
const CHECK_INTERVAL_MS    = 60 * 1000;       // run every 1 minute

/**
 * Periodically mark devices as offline if they haven't called any API
 * within the last 10 minutes (based on lastSeenAt).
 */
function startDeviceOfflineCron() {
  setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() - OFFLINE_THRESHOLD_MS);
      const result = await Device.updateMany(
        { status: 'online', lastSeenAt: { $lt: cutoff } },
        { $set: { status: 'offline' } }
      );
      if (result.modifiedCount > 0) {
        console.log(`[DeviceCron] Marked ${result.modifiedCount} device(s) offline`);
      }
    } catch (err) {
      console.error('[DeviceCron] Error:', err.message);
    }
  }, CHECK_INTERVAL_MS);

  console.log('[DeviceCron] Offline check running every 60s (threshold: 10 min)');
}

module.exports = { startDeviceOfflineCron };
