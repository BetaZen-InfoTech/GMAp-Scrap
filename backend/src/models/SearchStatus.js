const mongoose = require('mongoose');

const searchStatusSchema = new mongoose.Schema(
  {
    jobId: { type: String, required: true, index: true },
    deviceId: { type: String },
    pincode: { type: Number, required: true },
    district: { type: String },
    stateName: { type: String },
    category: { type: String, required: true },
    subCategory: { type: String, required: true },
    round: { type: Number, required: true },
    status: {
      type: String,
      enum: ['completed', 'error'],
      default: 'completed',
    },
    sessionId: { type: String },
  },
  {
    collection: 'Search-Status',
    timestamps: true,
  }
);

// Compound unique index: one entry per (job + pincode + niche + round)
searchStatusSchema.index(
  { jobId: 1, pincode: 1, subCategory: 1, category: 1, round: 1 },
  { unique: true }
);

module.exports = mongoose.model('SearchStatus', searchStatusSchema);
