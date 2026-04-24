const ScrapeTracking = require('../models/ScrapeTracking');
const { startCron } = require('../utils/cronRunner');

const STOP_THRESHOLD_MS  = 3 * 60 * 1000; // 3 min of inactivity → stop
const CHECK_INTERVAL_MS  = 3 * 60 * 1000; // run every 3 min

/**
 * Single check run:
 *
 * 1. Mark 'running' jobs as 'stop'   — if updatedAt older than 3 min and not yet finished
 * 2. Mark 'running' jobs as 'completed' — if completedSearches >= totalSearches (> 0)
 * 3. Restore 'stop' jobs back to 'running' — if new progress arrived (updatedAt < 3 min ago)
 */
async function runScrapeJobCheck() {
  const cutoff = new Date(Date.now() - STOP_THRESHOLD_MS);

  const [stoppedResult, completedResult, resumedResult] = await Promise.all([
    // 1. Running but stale → stop
    ScrapeTracking.updateMany(
      {
        status: 'running',
        updatedAt: { $lt: cutoff },
        $expr: { $lt: ['$completedSearches', '$totalSearches'] },
      },
      { $set: { status: 'stop' } }
    ),

    // 2. Running and fully completed → completed
    ScrapeTracking.updateMany(
      {
        status: 'running',
        totalSearches: { $gt: 0 },
        $expr: { $gte: ['$completedSearches', '$totalSearches'] },
      },
      { $set: { status: 'completed' } }
    ),

    // 3. Was stopped but new progress arrived → resume running
    ScrapeTracking.updateMany(
      {
        status: 'stop',
        updatedAt: { $gte: cutoff },
        $expr: { $lt: ['$completedSearches', '$totalSearches'] },
      },
      { $set: { status: 'running' } }
    ),
  ]);

  const result = {
    stopped:   stoppedResult.modifiedCount,
    completed: completedResult.modifiedCount,
    resumed:   resumedResult.modifiedCount,
  };

  if (result.stopped || result.completed || result.resumed) {
    console.log(
      `[ScrapeJobCron] ${new Date().toISOString()} — ` +
      `stopped: ${result.stopped}, completed: ${result.completed}, resumed: ${result.resumed}`
    );
  } else {
    console.log(`[ScrapeJobCron] ${new Date().toISOString()} — check done, no changes`);
  }

  return result;
}

function startScrapeJobCron() {
  console.log('[ScrapeJobCron] Starting — stop threshold: 3 min, interval: every 3 min');
  return startCron({
    name: 'ScrapeJobCron',
    intervalMs: CHECK_INTERVAL_MS,
    task: runScrapeJobCheck,
  });
}

module.exports = { startScrapeJobCron, runScrapeJobCheck };
