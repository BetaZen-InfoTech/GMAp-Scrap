const mongoose = require('mongoose');

const scrapedDataDuplicateSchema = new mongoose.Schema(
  {
    // Original fields (same as ScrapedData)
    sessionId: { type: String, index: true },
    deviceId: { type: String, index: true },
    batchNumber: { type: Number },
    name: { type: String },
    nameEnglish: { type: String },
    nameLocal: { type: String },
    address: { type: String },
    phone: { type: String },
    email: { type: String },
    website: { type: String },
    rating: { type: Number, default: 0 },
    reviews: { type: Number, default: 0 },
    category: { type: String },
    pincode: { type: String, index: true },
    plusCode: { type: String },
    photoUrl: { type: String },
    latitude: { type: Number },
    longitude: { type: Number },
    mapsUrl: { type: String },
    scrapKeyword: { type: String },
    scrapCategory: { type: String },
    scrapSubCategory: { type: String },
    scrapRound: { type: Number },
    scrapedAt: { type: String },
    isDuplicate: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    // Extra: when/why it was moved
    movedAt: { type: Date, default: Date.now },
    originalId: { type: String }, // original _id from Scraped-Data
  },
  {
    collection: 'Scraped-Data-Duplicate',
    timestamps: true,
  }
);

module.exports = mongoose.model('ScrapedDataDuplicate', scrapedDataDuplicateSchema);
