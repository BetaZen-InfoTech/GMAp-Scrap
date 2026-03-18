/**
 * Migration: Move ALL records from Scraped-Data-Duplicate back to Scraped-Data.
 * Strips only: _id, __v, movedAt, originalId
 * Does NOT add any extra flags.
 *
 * Run:
 *   node backend/src/migrations/restoreFromDuplicate.js
 *   node backend/src/migrations/restoreFromDuplicate.js --dry-run
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const mongoose = require('mongoose');
const connectDB = require('../config/db');

const isDryRun = process.argv.includes('--dry-run');
const BATCH = 500;

async function run() {
  await connectDB();

  const main = mongoose.connection.collection('Scraped-Data');
  const archive = mongoose.connection.collection('Scraped-Data-Duplicate');

  const total = await archive.countDocuments();
  console.log(`Total in Scraped-Data-Duplicate: ${total}`);
  if (isDryRun) console.log('DRY RUN — no changes will be made\n');

  let restored = 0;
  let skip = 0;

  while (true) {
    const batch = await archive.find({}).skip(skip).limit(BATCH).toArray();
    if (batch.length === 0) break;

    const archiveIds = batch.map((r) => r._id);

    // Strip archive-specific fields only
    const cleanDocs = batch.map((r) => {
      const { _id, __v, movedAt, originalId, ...rest } = r;
      return rest;
    });

    if (!isDryRun) {
      if (cleanDocs.length > 0) {
        await main.insertMany(cleanDocs, { ordered: false });
      }
      await archive.deleteMany({ _id: { $in: archiveIds } });
      restored += batch.length;
    } else {
      restored += batch.length;
      skip += BATCH;
    }

    process.stdout.write(`\rRestored: ${restored} / ${total}`);
  }

  console.log(`\n\nDone!`);
  console.log(`  Records ${isDryRun ? 'to restore (dry run)' : 'restored'}: ${restored}`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
