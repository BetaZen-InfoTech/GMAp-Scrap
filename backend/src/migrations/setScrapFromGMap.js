/**
 * Migration: Set scrapFrom = 'G-Map' for all records where it is missing or 'google-maps'
 *
 * Run once:
 *   node backend/src/migrations/setScrapFromGMap.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const mongoose = require('mongoose');
const connectDB = require('../config/db');

async function run() {
  await connectDB();

  const collection = mongoose.connection.collection('Scraped-Data');

  const filter = { $or: [{ scrapFrom: { $exists: false } }, { scrapFrom: null }, { scrapFrom: 'google-maps' }] };

  const result = await collection.updateMany(filter, { $set: { scrapFrom: 'G-Map' } });

  console.log(`Updated ${result.modifiedCount} records → scrapFrom = 'G-Map'`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
