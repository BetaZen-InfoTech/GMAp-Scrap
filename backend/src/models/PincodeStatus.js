const mongoose = require('mongoose');

const pincodeStatusSchema = new mongoose.Schema(
  {
    pincode: { type: String, required: true, unique: true, index: true },
    status: {
      type: String,
      enum: ['running', 'completed', 'stop'],
      default: 'running',
    },
    completedRounds: [{ type: Number }],   // rounds where ALL niches are done
    totalRounds: { type: Number, default: 0 }, // distinct rounds seen so far
    totalNiches: { type: Number, default: 0 },  // total niches at time of check
    completedSearches: { type: Number, default: 0 }, // total completed search entries
    lastActivity: { type: Date },           // latest Scraped-Data createdAt for this pincode
    updatedAt: { type: Date, default: Date.now },
  },
  {
    collection: 'Pincode-Status',
    timestamps: false,
  }
);

module.exports = mongoose.model('PincodeStatus', pincodeStatusSchema);
