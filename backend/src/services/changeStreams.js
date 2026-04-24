const DeviceHistory = require('../models/DeviceHistory');
const { isAuthzError, isStandaloneChangeStreamError, describe } = require('../utils/mongoErrors');

const BASE_RETRY_MS = 5_000;
const MAX_RETRY_MS  = 60_000;

let disabled = false;
let retryMs  = BASE_RETRY_MS;
let pendingTimer = null;

function setupChangeStreams(io) {
  if (disabled) return;

  try {
    const pipeline = [
      { $match: { operationType: { $in: ['insert', 'update', 'replace'] } } },
    ];

    const changeStream = DeviceHistory.watch(pipeline, {
      fullDocument: 'updateLookup',
    });

    changeStream.on('change', (change) => {
      // Successful event — reset backoff
      retryMs = BASE_RETRY_MS;
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
      // Fatal — log ONCE and stop retrying.
      if (isAuthzError(err)) {
        disabled = true;
        console.warn('[ChangeStream] Disabled — MongoDB user lacks permission to open a change stream on Device-History. Grant `find` on the collection and retry.');
        try { changeStream.close(); } catch (_) { /* ignore */ }
        return;
      }
      if (isStandaloneChangeStreamError(err)) {
        disabled = true;
        console.warn('[ChangeStream] Disabled — MongoDB cluster is not a replica set. Change streams require a replica set or sharded cluster.');
        try { changeStream.close(); } catch (_) { /* ignore */ }
        return;
      }

      // Transient — retry with exponential backoff capped at MAX_RETRY_MS.
      console.error(`[ChangeStream] Transient error, retry in ${retryMs}ms — ${describe(err)}`);
      try { changeStream.close(); } catch (_) { /* ignore */ }
      if (pendingTimer) clearTimeout(pendingTimer);
      const delay = retryMs;
      retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
      pendingTimer = setTimeout(() => {
        pendingTimer = null;
        setupChangeStreams(io);
      }, delay);
    });

    console.log('[ChangeStream] Watching Device-History collection');
  } catch (err) {
    console.error('[ChangeStream] Failed to setup:', describe(err));
  }
}

/** Test / diagnostic helper — reset internal state. */
function __resetForTests() {
  disabled = false;
  retryMs = BASE_RETRY_MS;
  if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
}

module.exports = { setupChangeStreams, __resetForTests };
