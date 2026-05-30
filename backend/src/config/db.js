const mongoose = require('mongoose');
const { isAuthzError } = require('../utils/mongoErrors');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);

    // ── Migrate old indexes: drop old compound indexes if they exist ──
    const migrations = [
      {
        collection: 'Search-Status',
        isOld: (idx) => idx.key && idx.key.jobId && idx.key.round,
      },
      {
        collection: 'Session-Stats',
        isOld: (idx) => idx.key && idx.key.sessionId && idx.unique,
      },
    ];

    let authzWarned = false;
    for (const m of migrations) {
      try {
        const col = conn.connection.collection(m.collection);
        const indexes = await col.indexes();
        for (const idx of indexes) {
          if (idx.name === '_id_') continue;
          if (m.isOld(idx)) {
            await col.dropIndex(idx.name);
            console.log(`[DB Migration] Dropped old ${m.collection} index: ${idx.name}`);
          }
        }
      } catch (err) {
        if (err.code === 26) continue; // namespace not found — benign
        if (isAuthzError(err)) {
          if (!authzWarned) {
            console.log('[DB Migration] Skipped — MongoDB user lacks `dbAdmin` on this database. Grant it to enable index migrations.');
            authzWarned = true;
          }
          continue;
        }
        console.log(`[DB Migration] ${m.collection} index check: ${err.message}`);
      }
    }

    // ── v1.8.9 — Verify load-bearing unique indexes ──
    // Mongoose's autoIndex is async and best-effort; in prod it silently
    // failed to create the unique index on Website-Analysis.website (very
    // likely the same authz cause as the migrations above), which led to
    // ~10M rows accumulating with no dedup. Verify explicitly at boot and
    // shout if the index is missing — better a noisy log than a quiet bug.
    try {
      const wa = conn.connection.collection('Website-Analysis');
      const waIndexes = await wa.indexes();
      const websiteUnique = waIndexes.find(
        (i) => i.unique && i.key && i.key.website === 1 && Object.keys(i.key).length === 1
      );
      if (websiteUnique) {
        console.log(`[DB Indexes] Website-Analysis.website unique index OK (${websiteUnique.name})`);
      } else {
        console.log('[DB Indexes] Website-Analysis.website unique index MISSING — attempting to create…');
        try {
          await wa.createIndex({ website: 1 }, { unique: true, name: 'website_unique_idx' });
          console.log('[DB Indexes] Website-Analysis.website unique index created.');
        } catch (createErr) {
          if (createErr.code === 11000 || /duplicate/i.test(createErr.message || '')) {
            console.log('[DB Indexes] !!! Cannot create unique index — duplicates already exist.');
            console.log('[DB Indexes] !!! Run: npm run dedup:website-analysis');
            console.log('[DB Indexes] !!! Until then the worker still dedups in app code (v1.8.9 pre-check pipeline).');
          } else if (isAuthzError(createErr)) {
            console.log('[DB Indexes] !!! Cannot create unique index — Mongo user lacks createIndex on this DB.');
            console.log('[DB Indexes] !!! Worker will dedup in app code (v1.8.9 pre-check pipeline) but races between concurrent runs may slip duplicates.');
          } else {
            console.log(`[DB Indexes] !!! createIndex failed: ${createErr.message}`);
          }
        }
      }
    } catch (err) {
      if (err.code !== 26) console.log(`[DB Indexes] Website-Analysis verify failed: ${err.message}`);
    }
  } catch (error) {
    console.error(`MongoDB Connection Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
