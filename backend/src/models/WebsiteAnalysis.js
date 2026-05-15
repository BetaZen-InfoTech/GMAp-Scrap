const mongoose = require('mongoose');

// One record per unique website. Mirrors Scraped-Data's shape so the admin
// can browse it with the same column layout. Inserts are deduped by the
// unique index on `website` below — first record with a given website wins,
// subsequent attempts hit E11000 and are counted as "skipped" by the worker.
const websiteAnalysisSchema = new mongoose.Schema(
  {
    sessionId: { type: String, index: true },
    deviceId: { type: String, index: true },
    name: { type: String },
    nameEnglish: { type: String },
    nameLocal: { type: String },
    address: { type: String },
    phone: { type: String },
    email: { type: String },
    website: { type: String, required: true },
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
    scrapFrom: { type: String, default: 'G-Map' },
    // Origin pointer: the _id of the source Scraped-Data doc this entry came from.
    sourceId: { type: String },
  },
  {
    collection: 'Website-Analysis',
    timestamps: true,
  }
);

websiteAnalysisSchema.index({ website: 1 }, { unique: true });

module.exports = mongoose.model('WebsiteAnalysis', websiteAnalysisSchema);
