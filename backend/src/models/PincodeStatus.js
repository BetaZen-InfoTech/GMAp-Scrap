const mongoose = require('mongoose');

const pincodeStatusSchema = new mongoose.Schema(
  {
    pincode:          { type: String, required: true, unique: true, index: true },
    stateName:        { type: String, index: true },      // from PinCode-Dataset
    district:         { type: String, index: true },      // from PinCode-Dataset
    status: {
      type: String,
      enum: ['running', 'completed', 'stop'],
      default: 'running',
      index: true,
    },
    completedRounds:  [{ type: Number }],                 // rounds where ALL niches are done
    totalRounds:      { type: Number, default: 0 },       // distinct rounds seen so far
    totalNiches:      { type: Number, default: 0 },       // total niches at time of check
    completedSearches:{ type: Number, default: 0 },       // total completed search entries
    lastActivity:     { type: Date },                     // latest Scraped-Data createdAt for this pincode
    lastRunAt:        { type: Date },                     // first time the cron processed this pincode
    updatedAt:        { type: Date, default: Date.now },
  },
  {
    collection: 'Pincode-Status',
    timestamps: false,
  }
);

// Compound indexes for the Coming Pincodes page filters
pincodeStatusSchema.index({ stateName: 1, status: 1 });
pincodeStatusSchema.index({ district: 1, status: 1 });

module.exports = mongoose.model('PincodeStatus', pincodeStatusSchema);
