const mongoose = require('mongoose');

const scrapedDataSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, index: true },
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
    isDuplicate: { type: Boolean, default: false, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
    scrapFrom: { type: String, default: 'G-Map' },
    scrapWebsite: { type: Boolean, default: false, index: true },
  },
  {
    collection: 'Scraped-Data',
    timestamps: true,
  }
);

// Compound index for duplicate detection: phone + rating + reviews + category + plusCode
scrapedDataSchema.index(
  { phone: 1, rating: 1, reviews: 1, category: 1, plusCode: 1 },
  { name: 'duplicate_check_idx' }
);

module.exports = mongoose.model('ScrapedData', scrapedDataSchema);
