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
    scrapFrom: { type: String, default: 'G-Map' },
    scrapWebsite: { type: Boolean, default: false, index: true },
    numberFixing: { type: Boolean, default: false },
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

// Compound index for the website-scraper queue query
// (GET /api/scraped-data/website-pool). Without this, the
// .find({ scrapFrom, scrapWebsite: $ne true }).sort({_id}).skip(N).limit(M)
// pipeline does a full collection scan at 7M+ rows. The prefix matches the
// filter, _id supports the sort, and the partial filter keeps the index
// small by only indexing unscraped G-Map rows (which is what the query
// always asks for).
scrapedDataSchema.index(
  { scrapFrom: 1, scrapWebsite: 1, _id: 1 },
  {
    name: 'website_pool_idx',
    partialFilterExpression: { scrapFrom: 'G-Map' },
  }
);

// v1.8.7 — Index for the mirror-update path. After each website scrape the
// backend flips scrapWebsite=true on every Scraped-Data row sharing the URL
// (so the legacy admin browser-flow queue stays consistent with the new
// Website-Analysis queue). Without this index, that updateMany ran as a
// full collection scan on ~6M rows for EVERY scraped site — 4 parallel
// CLI workers × hundreds of sites/hour was the #1 source of MongoDB CPU
// load. Sparse: rows without a website (~80% of the collection) stay out
// of the index, keeping it small.
scrapedDataSchema.index(
  { website: 1 },
  { name: 'website_idx', sparse: true }
);

module.exports = mongoose.model('ScrapedData', scrapedDataSchema);
