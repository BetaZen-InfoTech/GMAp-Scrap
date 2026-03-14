const DeviceHistory = require('../models/DeviceHistory');

function setupChangeStreams(io) {
  try {
    const pipeline = [
      { $match: { operationType: { $in: ['insert', 'update', 'replace'] } } },
    ];

    const changeStream = DeviceHistory.watch(pipeline, {
      fullDocument: 'updateLookup',
    });

    changeStream.on('change', (change) => {
      if (change.fullDocument) {
        const { deviceId, date, stats } = change.fullDocument;
        if (stats && stats.length > 0) {
          const latestStat = stats[stats.length - 1];
          io.emit('device:stats-live', {
            deviceId,
            date,
            stat: latestStat,
            totalSnapshots: stats.length,
          });
        }
      }
    });

    changeStream.on('error', (err) => {
      console.error('[ChangeStream] Error:', err.message);
      // Don't retry if not a replica set — it will never work
      if (err.message && err.message.includes('replica set')) {
        console.log('[ChangeStream] Not a replica set — change streams disabled');
        return;
      }
      // Retry other errors after delay
      setTimeout(() => setupChangeStreams(io), 5000);
    });

    console.log('[ChangeStream] Watching Device-History collection');
  } catch (err) {
    console.error('[ChangeStream] Failed to setup:', err.message);
  }
}

module.exports = { setupChangeStreams };
