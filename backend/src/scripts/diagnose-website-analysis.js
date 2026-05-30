/**
 * READ-ONLY DIAGNOSTIC — does NOT write, drop, or modify anything.
 *
 * Investigates why the Website-Analysis dedup job is reporting 0 skipped
 * despite re-running over a populated collection. Three things to check:
 *
 *   1. Does the unique index on `website` actually exist in prod?
 *      (mongoose autoIndex can silently fail if the Mongo user lacks
 *      createIndex privilege — db.js already has this exact authz caveat
 *      for Search-Status / Session-Stats.)
 *
 *   2. How many docs are in the collection right now?
 *      (estimatedDocumentCount vs the actual countDocuments — if they
 *      diverge a lot, the stat card is showing stale metadata.)
 *
 *   3. Are there actual duplicate websites in the collection? An aggregate
 *      that groups by website and reports any group with count > 1.
 *      Sampled at 50K docs so the query stays cheap.
 *
 * Run: node backend/src/scripts/diagnose-website-analysis.js
 */

require('../config/loadEnv');

const mongoose = require('mongoose');

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set. Check .env / APP_STATE.');
    process.exit(1);
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15_000 });
  console.log('Connected:', mongoose.connection.host, '/', mongoose.connection.name);

  const col = mongoose.connection.collection('Website-Analysis');

  // ── 1. Indexes ─────────────────────────────────────────────────────────────
  console.log('\n--- Website-Analysis indexes ---');
  const indexes = await col.indexes();
  for (const idx of indexes) {
    const flags = [];
    if (idx.unique) flags.push('UNIQUE');
    if (idx.sparse) flags.push('sparse');
    if (idx.partialFilterExpression) flags.push(`partial=${JSON.stringify(idx.partialFilterExpression)}`);
    console.log(`  ${idx.name.padEnd(28)} key=${JSON.stringify(idx.key).padEnd(40)} ${flags.join(' ')}`);
  }
  const websiteUniqueIdx = indexes.find((i) => i.unique && i.key && i.key.website === 1 && Object.keys(i.key).length === 1);
  const scrapWebsiteCompoundIdx = indexes.find((i) => i.key && i.key.scrapWebsite === 1 && i.key._id === 1);
  console.log('\n  >> unique index on website (single-field):', websiteUniqueIdx ? `YES — name=${websiteUniqueIdx.name}` : 'NO  ← THIS IS LIKELY THE BUG');
  console.log('  >> compound (scrapWebsite, _id):          ', scrapWebsiteCompoundIdx ? `YES — name=${scrapWebsiteCompoundIdx.name}` : 'NO');

  // ── 2. Counts ──────────────────────────────────────────────────────────────
  console.log('\n--- Counts ---');
  const estCount = await col.estimatedDocumentCount();
  console.log(`  estimatedDocumentCount: ${estCount.toLocaleString()}`);
  // countDocuments({}) is exact but slow on large colls — use it anyway since
  // this is read-only diagnostic, not a hot path.
  console.log('  Running exact countDocuments({})... (may take a few seconds)');
  const tStart = Date.now();
  const exactCount = await col.countDocuments({});
  console.log(`  exact countDocuments:   ${exactCount.toLocaleString()} (${(Date.now() - tStart)}ms)`);
  console.log(`  >> diff: ${(exactCount - estCount).toLocaleString()}`);

  // ── 3. Duplicate-website check (sampled) ───────────────────────────────────
  console.log('\n--- Duplicate website probe (top 10 most-duplicated, sampled 50K) ---');
  const dups = await col.aggregate([
    { $sample: { size: 50_000 } },
    { $match: { website: { $nin: [null, ''] } } },
    { $group: { _id: '$website', count: { $sum: 1 } } },
    { $match: { count: { $gte: 2 } } },
    { $sort: { count: -1 } },
    { $limit: 10 },
  ], { allowDiskUse: true }).toArray();

  if (dups.length === 0) {
    console.log('  No duplicate URLs found in the 50K sample.');
    console.log('  (Either there genuinely aren\'t any, OR the sample missed them — re-run for a different draw.)');
  } else {
    for (const d of dups) {
      console.log(`  ${String(d.count).padStart(4)}×  ${String(d._id).slice(0, 100)}`);
    }
    console.log('\n  >> Duplicates EXIST in the collection. Confirms unique-index is missing or broken.');
  }

  // ── 4. Cross-check against the schema ──────────────────────────────────────
  console.log('\n--- Conclusion ---');
  if (!websiteUniqueIdx) {
    console.log('  • The unique index on `website` is MISSING from the live collection.');
    console.log('  • Schema declares it (models/WebsiteAnalysis.js line 50). Mongoose\'s autoIndex did not create it on this collection.');
    console.log('  • Likely cause: prod Mongo user lacks createIndex privilege (matches the existing dbAdmin caveat in config/db.js).');
    console.log('  • Effect: every "dedup" job re-inserts every source row, no rejection, no skip count.');
    console.log('  • Fix: create the index with a dbAdmin-level user, OR grant createIndex to the app user, then re-run.');
  } else {
    console.log('  • Unique index exists. The 0-skipped counters must be a result-shape bug in the worker.');
    console.log('  • Fix: switch the worker to insertMany({ ordered:false, rawResult:true }) and count via insertedCount.');
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('\nDiagnostic FAILED:', err.message);
  if (err.message?.includes('ETIMEDOUT') || err.message?.includes('ECONNREFUSED')) {
    console.error('Network not reachable to the Mongo host. Run this on a machine that can reach the prod Mongo (e.g., the backend server).');
  }
  process.exit(1);
});
