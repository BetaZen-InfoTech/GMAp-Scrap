const mongoose = require('mongoose');

// Tracks each run of the website-dedup background worker. The admin polls
// these docs to show progress + a history view. `lastProgressAt` lets a
// later /start call detect a crashed run (status still "running" but no
// heartbeat in N minutes) and recover.
const websiteAnalysisJobSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['queued', 'running', 'completed', 'error', 'stopped'],
      default: 'queued',
      index: true,
    },
    triggeredBy: { type: String, default: 'admin' },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
    lastProgressAt: { type: Date, default: Date.now },

    // Counters — updated as the cursor advances
    totalToProcess: { type: Number, default: 0 },  // count of source rows matching the filter
    processed: { type: Number, default: 0 },        // how many rows the cursor has seen
    inserted: { type: Number, default: 0 },         // unique websites written
    skipped: { type: Number, default: 0 },          // duplicates rejected by the unique index
    errored: { type: Number, default: 0 },          // unexpected write errors (not E11000)

    errorMessage: { type: String },
  },
  {
    collection: 'Website-Analysis-Jobs',
    timestamps: true,
  }
);

module.exports = mongoose.model('WebsiteAnalysisJob', websiteAnalysisJobSchema);
