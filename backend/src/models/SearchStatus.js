const mongoose = require('mongoose');

const searchStatusSchema = new mongoose.Schema(
  {
    jobId: { type: String, index: true },
    deviceId: { type: String },
    pincode: { type: Number, required: true },
    district: { type: String },
    stateName: { type: String },
    category: { type: String, required: true },
    subCategory: { type: String, required: true },
    // Tracks which rounds are completed — e.g. [1], [1,2], [1,2,3]
    rounds: { type: [Number], default: [] },
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

// Compound unique index: one entry per (pincode + category + subCategory)
// No jobId or round in the index — single doc tracks all rounds
searchStatusSchema.index(
  { pincode: 1, category: 1, subCategory: 1 },
  { unique: true }
);

module.exports = mongoose.model('SearchStatus', searchStatusSchema);
