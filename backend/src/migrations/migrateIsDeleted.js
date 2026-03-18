/**
 * Migration: Handle existing isDeleted records in Scraped-Data.
 * 1. Move records with isDeleted=true to Scraped-Data-Deleted collection.
 * 2. $unset isDeleted field from all remaining records.
 *
 * Run:
 *   node backend/src/migrations/migrateIsDeleted.js
 *   node backend/src/migrations/migrateIsDeleted.js --dry-run
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const mongoose = require('mongoose');
const connectDB = require('../config/db');

const isDryRun = process.argv.includes('--dry-run');
const BATCH = 500;

async function run() {
  await connectDB();

  const main = mongoose.connection.collection('Scraped-Data');
  const deleted = mongoose.connection.collection('Scraped-Data-Deleted');

  // Step 1: Move isDeleted=true records to Scraped-Data-Deleted
  let movedCount = 0;
  const deletedAt = new Date();

  while (true) {
    const batch = await main.find({ isDeleted: true }).limit(BATCH).toArray();
    if (batch.length === 0) break;

    const batchIds = batch.map((r) => r._id);
    const archiveDocs = batch.map((r) => {
      const { _id, __v, isDeleted, ...rest } = r;
      return { ...rest, originalId: String(_id), deletedAt };
    });

    if (!isDryRun) {
      await deleted.insertMany(archiveDocs, { ordered: false });
      await main.deleteMany({ _id: { $in: batchIds } });
    }

    movedCount += batch.length;
    process.stdout.write(`\rMoved: ${movedCount}`);
  }

  // Step 2: Unset isDeleted from all remaining records
  let unsetCount = 0;
  if (!isDryRun) {
    const result = await main.updateMany({ isDeleted: { $exists: true } }, { $unset: { isDeleted: '' } });
    unsetCount = result.modifiedCount;
  } else {
    unsetCount = await main.countDocuments({ isDeleted: { $exists: true } });
  }

  console.log(`\n\nDone!`);
  console.log(`  Records ${isDryRun ? 'to move (dry run)' : 'moved to Scraped-Data-Deleted'}: ${movedCount}`);
  console.log(`  Records ${isDryRun ? 'to unset isDeleted (dry run)' : 'isDeleted field removed'}: ${unsetCount}`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
