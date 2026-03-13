const mongoose = require('mongoose');

const sessionStatsSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, index: true },
    jobId: { type: String, index: true },
    deviceId: { type: String, index: true },
    keyword: { type: String },
    pincode: { type: Number },
    district: { type: String },
    stateName: { type: String },
    category: { type: String },
    subCategory: { type: String },
    round: { type: Number },
    totalRecords: { type: Number, default: 0 },
    insertedRecords: { type: Number, default: 0 },
    duplicateRecords: { type: Number, default: 0 },
    batchesSent: { type: Number, default: 0 },
    excelUploaded: { type: Boolean, default: false },
    status: { type: String, enum: ['completed', 'error', 'partial'], default: 'completed' },
    startedAt: { type: String },
    completedAt: { type: String },
    durationMs: { type: Number },
  },
  {
    collection: 'Session-Stats',
    timestamps: true,
  }
);

// Unique per session
sessionStatsSchema.index({ sessionId: 1 }, { unique: true });

// Index for keyword-based completion check (used before each session)
sessionStatsSchema.index({ keyword: 1, status: 1 }, { name: 'keyword_status_idx' });

module.exports = mongoose.model('SessionStats', sessionStatsSchema);
