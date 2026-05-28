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

    // ── Website-scraper progress (v1.8.6) ──
    // This collection is now the SCRAPE QUEUE for the website scraper: it holds
    // one row per unique website, so the scraper visits each site exactly once
    // (the raw Scraped-Data had ~14× duplicate URLs). scrapWebsite flips true
    // when contacts have been harvested (or the site yielded nothing).
    scrapWebsite: { type: Boolean, default: false, index: true },
    contactScrapedAt: { type: Date },
  },
  {
    collection: 'Website-Analysis',
    timestamps: true,
  }
);

websiteAnalysisSchema.index({ website: 1 }, { unique: true });

// Pool query index: the website scraper pulls `scrapWebsite: {$ne:true}` sorted
// by _id. This compound index covers the filter + sort so the queue fetch
// stays an index scan even as the collection grows.
websiteAnalysisSchema.index({ scrapWebsite: 1, _id: 1 });

module.exports = mongoose.model('WebsiteAnalysis', websiteAnalysisSchema);
