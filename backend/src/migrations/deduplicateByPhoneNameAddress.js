/**
 * Migration: Remove duplicates where phone + name + address all match.
 * Keeps the FIRST record (oldest _id), deletes the rest.
 *
 * Scope: Only scrapFrom = 'G-Map' records (pass --all to include all scrapFrom values)
 *
 * Run:
 *   node backend/src/migrations/deduplicateByPhoneNameAddress.js
 *   node backend/src/migrations/deduplicateByPhoneNameAddress.js --all
 *   node backend/src/migrations/deduplicateByPhoneNameAddress.js --dry-run
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const mongoose = require('mongoose');
const connectDB = require('../config/db');

const isDryRun = process.argv.includes('--dry-run');
const allSources = process.argv.includes('--all');

async function run() {
  await connectDB();

  const collection = mongoose.connection.collection('Scraped-Data');

  const matchStage = {
    // Only consider records where all 3 fields are non-null and non-empty
    phone:   { $exists: true, $nin: [null, ''] },
    name:    { $exists: true, $nin: [null, ''] },
    address: { $exists: true, $nin: [null, ''] },
  };

  if (!allSources) {
    matchStage.scrapFrom = 'G-Map';
  }

  console.log(`Scanning for duplicates (scrapFrom: ${allSources ? 'ALL' : "'G-Map'"}) ...`);
  if (isDryRun) console.log('DRY RUN — no records will be deleted\n');

  // Group by phone + name + address, collect all _ids, keep the first
  const cursor = collection.aggregate([
    { $match: matchStage },
    { $sort: { _id: 1 } }, // oldest first
    {
      $group: {
        _id: {
          phone:   { $toLower: { $trim: { input: '$phone' } } },
          name:    { $toLower: { $trim: { input: '$name' } } },
          address: { $toLower: { $trim: { input: '$address' } } },
        },
        keepId:  { $first: '$_id' },
        allIds:  { $push: '$_id' },
        count:   { $sum: 1 },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ], { allowDiskUse: true });

  let dupGroupCount = 0;
  let totalToDelete = 0;
  const batchSize = 500;
  let deleteBatch = [];

  const flushDelete = async () => {
    if (deleteBatch.length === 0) return;
    if (!isDryRun) {
      await collection.deleteMany({ _id: { $in: deleteBatch } });
    }
    totalToDelete += deleteBatch.length;
    deleteBatch = [];
  };

  for await (const group of cursor) {
    dupGroupCount++;
    // Delete all IDs except the first (keepId)
    const toDelete = group.allIds.filter((id) => !id.equals(group.keepId));
    deleteBatch.push(...toDelete);

    if (deleteBatch.length >= batchSize) {
      await flushDelete();
      process.stdout.write(`\rGroups processed: ${dupGroupCount} | Deleted: ${totalToDelete}`);
    }
  }

  await flushDelete();

  console.log(`\n\nDone!`);
  console.log(`  Duplicate groups found : ${dupGroupCount}`);
  console.log(`  Records ${isDryRun ? 'to delete (dry run)' : 'deleted'} : ${totalToDelete}`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
