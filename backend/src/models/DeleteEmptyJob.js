const mongoose = require('mongoose');

// Tracks each run of the "delete records with no contact info" background
// worker. The admin polls these docs to show progress + a history view.
// `lastProgressAt` lets a later /start call detect a crashed run (status
// still "running" but no heartbeat in N minutes) and recover.
//
// Mirrors WebsiteAnalysisJob in shape so the admin UI patterns line up.
const deleteEmptyJobSchema = new mongoose.Schema(
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

    // Counters — updated as each batch finishes
    totalToDelete: { type: Number, default: 0 },   // count at job start
    deleted: { type: Number, default: 0 },          // rows successfully archived + removed
    errored: { type: Number, default: 0 },          // batches that failed mid-flight
    errorMessage: { type: String },
  },
  {
    collection: 'Delete-Empty-Jobs',
    timestamps: true,
  }
);

module.exports = mongoose.model('DeleteEmptyJob', deleteEmptyJobSchema);
