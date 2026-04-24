const SearchStatus  = require('../models/SearchStatus');
const BusinessNiche = require('../models/BusinessNiche');
const PincodeStatus = require('../models/PincodeStatus');
const ScrapedData   = require('../models/ScrapedData');
const PinCode       = require('../models/PinCode');
const { startCron }  = require('../utils/cronRunner');

const COMPLETION_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes
const STOP_INTERVAL_MS       = 3 * 60 * 1000; // every 3 minutes
const STOP_THRESHOLD_MS      = 3 * 60 * 1000; // no data for 3 min → stop

// ──────────────────────────────────────────────────────────────────────────────
// Helper: batch-fetch stateName + district from PinCode-Dataset
// ──────────────────────────────────────────────────────────────────────────────
async function buildPincodeLocationMap(pincodeNumbers) {
  if (!pincodeNumbers || pincodeNumbers.length === 0) return {};
  const docs = await PinCode.find(
    { Pincode: { $in: pincodeNumbers } },
    { Pincode: 1, District: 1, StateName: 1, _id: 0 }
  ).lean();
  const map = {};
  for (const d of docs) {
    // Keep first occurrence per pincode
    if (!map[d.Pincode]) {
      map[d.Pincode] = { stateName: d.StateName || null, district: d.District || null };
    }
  }
  return map;
}

// ──────────────────────────────────────────────────────────────────────────────
// CHECK 1: Pincode completion (all niches done for all rounds → "completed")
// ──────────────────────────────────────────────────────────────────────────────
async function runPincodeCompletionCheck() {
  const totalNiches = await BusinessNiche.countDocuments();
  if (totalNiches === 0) {
    console.log('[PincodeCron] Skipped — no niches in BusinessNiche');
    return { updated: 0, completed: 0, running: 0 };
  }

  // Aggregate: for each pincode → count completed niches per round
  // Handles both new format (rounds: [1,2,3]) and old format (round: 1)
  const roundStats = await SearchStatus.aggregate([
    { $match: { status: 'completed' } },
    // Normalize: merge old `round` field AND `rounds` array into one unified array
    // Handles: rounds=[1,2], round=1 (old), rounds=[2]+round=1 (mixed), etc.
    {
      $addFields: {
        _rounds: {
          $setUnion: [
            { $cond: { if: { $and: [{ $isArray: '$rounds' }, { $gt: [{ $size: '$rounds' }, 0] }] }, then: '$rounds', else: [] } },
            { $cond: { if: { $ifNull: ['$round', false] }, then: ['$round'], else: [] } },
          ],
        },
      },
    },
    { $unwind: '$_rounds' },
    {
      $group: {
        _id: { pincode: '$pincode', round: '$_rounds' },
        completedCount: { $sum: 1 },
      },
    },
    {
      $group: {
        _id: '$_id.pincode',
        rounds: {
          $push: {
            round: '$_id.round',
            completedCount: '$completedCount',
          },
        },
        totalCompleted: { $sum: '$completedCount' },
      },
    },
  ]);

  if (roundStats.length === 0) {
    console.log('[PincodeCron] No data in Search-Status');
    return { updated: 0, completed: 0, running: 0 };
  }

  // Batch-fetch location data for all pincodes in this batch
  const pincodeNumbers = roundStats.map(item => Number(item._id)).filter(Boolean);
  const locationMap = await buildPincodeLocationMap(pincodeNumbers);

  const now = new Date();
  const bulkOps = [];
  let completedCount = 0;
  let runningCount = 0;

  for (const item of roundStats) {
    const pincode = String(item._id);
    const loc = locationMap[parseInt(pincode)] || {};

    const completedRounds = item.rounds
      .filter((r) => r.completedCount >= totalNiches)
      .map((r) => r.round)
      .sort((a, b) => a - b);

    // All 3 rounds must exist AND each must have all niches completed
    const allRoundsDone =
      completedRounds.length >= 3 &&
      [1, 2, 3].every((r) => completedRounds.includes(r));

    const status = allRoundsDone ? 'completed' : 'running';
    if (allRoundsDone) completedCount++;
    else runningCount++;

    bulkOps.push({
      updateOne: {
        filter: { pincode },
        update: {
          $set: {
            pincode,
            stateName:         loc.stateName || null,
            district:          loc.district  || null,
            status,
            completedRounds,
            totalRounds:       item.rounds.length,
            totalNiches,
            completedSearches: item.totalCompleted,
            updatedAt:         now,
          },
          // lastRunAt is set only on insert (first time cron sees this pincode)
          $setOnInsert: { lastRunAt: now },
        },
        upsert: true,
      },
    });
  }

  if (bulkOps.length > 0) {
    await PincodeStatus.bulkWrite(bulkOps, { ordered: false });
  }

  console.log(
    `[PincodeCron] ${now.toISOString()} — completion check: ${roundStats.length} pincodes` +
    ` | completed: ${completedCount} | running: ${runningCount}`
  );

  return { updated: bulkOps.length, completed: completedCount, running: runningCount };
}

// ──────────────────────────────────────────────────────────────────────────────
// CHECK 2: Pincode stop detection (no new data submitted for 3 min → "stop")
// ──────────────────────────────────────────────────────────────────────────────
async function runPincodeStopCheck() {
  const cutoff = new Date(Date.now() - STOP_THRESHOLD_MS);
  const now    = new Date();

  // Get latest Scraped-Data createdAt per pincode
  const activityAgg = await ScrapedData.aggregate([
    {
      $match: {
        pincode: { $exists: true, $nin: [null, ''] },
      },
    },
    {
      $group: {
        _id: '$pincode',
        lastActivity: { $max: '$createdAt' },
      },
    },
  ]);

  if (activityAgg.length === 0) return { stopped: 0, resumed: 0 };

  const bulkOps = [];
  let stoppedCount = 0;
  let resumedCount = 0;

  for (const item of activityAgg) {
    const pincode     = String(item._id);
    const lastActivity = item.lastActivity ? new Date(item.lastActivity) : null;
    const isStale     = !lastActivity || lastActivity < cutoff;

    if (isStale) {
      // No data in 3+ min: mark 'running' pincodes as 'stop'
      // (Never downgrade 'completed' to 'stop')
      bulkOps.push({
        updateOne: {
          filter: { pincode, status: 'running' },
          update: { $set: { status: 'stop', lastActivity, updatedAt: now } },
        },
      });
      stoppedCount++;
    } else {
      // Data is fresh: if currently 'stop', restore to 'running'
      bulkOps.push({
        updateOne: {
          filter: { pincode, status: 'stop' },
          update: { $set: { status: 'running', lastActivity, updatedAt: now } },
        },
      });
      // Also keep lastActivity fresh on running/completed entries
      bulkOps.push({
        updateOne: {
          filter: { pincode, status: { $in: ['running', 'completed'] } },
          update: { $set: { lastActivity, updatedAt: now } },
        },
      });
      resumedCount++;
    }
  }

  if (bulkOps.length > 0) {
    await PincodeStatus.bulkWrite(bulkOps, { ordered: false });
  }

  console.log(
    `[PincodeCron] ${now.toISOString()} — stop check: ${activityAgg.length} pincodes` +
    ` | newly stopped: ${stoppedCount} | active: ${resumedCount}`
  );

  return { stopped: stoppedCount, resumed: resumedCount };
}

// ──────────────────────────────────────────────────────────────────────────────
// Start both crons
// ──────────────────────────────────────────────────────────────────────────────
function startPincodeCompletionCron() {
  console.log('[PincodeCron] Starting — completion: every 5 min | stop check: every 3 min');
  const completion = startCron({
    name: 'PincodeCron/completion',
    intervalMs: COMPLETION_INTERVAL_MS,
    task: runPincodeCompletionCheck,
  });
  const stop = startCron({
    name: 'PincodeCron/stop-check',
    intervalMs: STOP_INTERVAL_MS,
    task: runPincodeStopCheck,
  });
  return { completion, stop };
}

module.exports = { startPincodeCompletionCron, runPincodeCompletionCheck, runPincodeStopCheck };
