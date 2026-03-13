require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const path = require('path');

const BusinessNiche = require('../models/BusinessNiche');
const PinCode = require('../models/PinCode');

const businessNiches = require(path.join(__dirname, '../../../seed-data/business_niches.json'));
const pinCodes = require(path.join(__dirname, '../../../seed-data/indian-pincode.json'));

const MONGODB_URI = process.env.MONGODB_URI;

async function seed() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected.\n');

    // --- Business Niches ---
    console.log('Seeding Business-Niches collection...');
    await BusinessNiche.deleteMany({});
    const niches = await BusinessNiche.insertMany(businessNiches);
    console.log(`  Inserted ${niches.length} business niches.\n`);

    // --- PinCode Dataset ---
    console.log('Seeding PinCode-Dataset collection...');
    await PinCode.deleteMany({});

    // Insert in batches to avoid memory issues with large dataset
    const BATCH_SIZE = 1000;
    let inserted = 0;
    for (let i = 0; i < pinCodes.length; i += BATCH_SIZE) {
      const batch = pinCodes.slice(i, i + BATCH_SIZE);
      await PinCode.insertMany(batch, { ordered: false });
      inserted += batch.length;
      process.stdout.write(`  Inserted ${inserted}/${pinCodes.length} pincodes...\r`);
    }
    console.log(`\n  Inserted ${inserted} pincodes.\n`);

    console.log('Seeding complete.');
  } catch (err) {
    console.error('Seeding error:', err.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

seed();
