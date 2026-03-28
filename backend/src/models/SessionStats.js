const mongoose = require('mongoose');

const sessionStatsSchema = new mongoose.Schema(
  {
    sessionId: { type: String },
    jobId: { type: String, index: true },
    deviceId: { type: String, index: true },
    keyword: { type: String },
    pincode: { type: Number },
    district: { type: String },
    stateName: { type: String },
    category: { type: String },
    subCategory: { type: String },
    // Tracks which rounds are completed — e.g. [1], [1,2], [1,2,3]
    rounds: { type: [Number], default: [] },
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

// One entry per (pincode + category + subCategory) — rounds tracked as array
sessionStatsSchema.index(
  { pincode: 1, category: 1, subCategory: 1 },
  { unique: true, partialFilterExpression: { pincode: { $exists: true }, category: { $exists: true }, subCategory: { $exists: true } } }
);

module.exports = mongoose.model('SessionStats', sessionStatsSchema);
