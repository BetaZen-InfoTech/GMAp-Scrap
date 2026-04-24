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
  } catch (error) {
    console.error(`MongoDB Connection Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
