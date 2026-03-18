const mongoose = require('mongoose');

const scrapedDataDeletedSchema = new mongoose.Schema(
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
    scrapFrom: { type: String },
    scrapWebsite: { type: Boolean },
    // Extra: when it was deleted and original _id
    deletedAt: { type: Date, default: Date.now },
    originalId: { type: String },
  },
  {
    collection: 'Scraped-Data-Deleted',
    timestamps: true,
  }
);

module.exports = mongoose.model('ScrapedDataDeleted', scrapedDataDeletedSchema);
