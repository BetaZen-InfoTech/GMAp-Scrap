const mongoose = require('mongoose');

const scrapeTrackingSchema = new mongoose.Schema(
  {
    jobId: { type: String, required: true, unique: true },
    deviceId: { type: String, required: true },
    startPincode: { type: Number, required: true },
    endPincode: { type: Number, required: true },
    pincodeIndex: { type: Number, default: 0 },
    nicheIndex: { type: Number, default: 0 },
    round: { type: Number, default: 1 },
    totalSearches: { type: Number, default: 0 },
    completedSearches: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['running', 'paused', 'completed', 'stopped'],
      default: 'running',
    },
  },
  {
    collection: 'Scrape-Tracking',
    timestamps: true,
  }
);

module.exports = mongoose.model('ScrapeTracking', scrapeTrackingSchema);
