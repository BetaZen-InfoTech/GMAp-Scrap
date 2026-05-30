/**
 * Migration: Normalize scrapFrom = 'Website' (capital W) → 'website' (lowercase).
 *
 * Legacy CLI WEB mode wrote scrapFrom: 'Website' on website-scraped rows.
 * The admin browser flow and the v1.8.8+ CLI both write lowercase 'website',
 * so the stats endpoint had to count both with a case-insensitive regex. This
 * migration normalizes the historical rows so we can drop the regex and rely
 * on an exact-match index.
 *
 * Run once:
 *   node backend/src/migrations/normalizeScrapFromWebsite.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const mongoose = require('mongoose');
const connectDB = require('../config/db');

async function run() {
  await connectDB();

  const collection = mongoose.connection.collection('Scraped-Data');

  // Match any case-variant of "website" that isn't already the canonical
  // lowercase form. /^website$/i excludes 'website' itself via the
  // $ne clause below.
  const filter = {
    scrapFrom: { $regex: /^website$/i, $ne: 'website' },
  };

  const result = await collection.updateMany(filter, { $set: { scrapFrom: 'website' } });

  console.log(`Updated ${result.modifiedCount} records → scrapFrom = 'website'`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
