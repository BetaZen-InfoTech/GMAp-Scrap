const mongoose = require('mongoose');

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
        if (err.code !== 26) console.log(`[DB Migration] ${m.collection} index check: ${err.message}`);
      }
    }
  } catch (error) {
    console.error(`MongoDB Connection Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
