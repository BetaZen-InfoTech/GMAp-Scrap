const mongoose = require('mongoose');

// Sub-schema for scrape tasks. Must be a separate Schema because the field "type"
// conflicts with Mongoose's type-declaration keyword inside a plain object literal.
//
// Type semantics:
//   jobs    — multi-pincode batch (jobs × 100 pincodes from startPin)
//   range   — scrape pincodes from startPin to endPin
//   single  — scrape just startPin
//   website — scrape contact info (email/phone/contact-person) from N unscraped
//             websites, split across 4 parallel workers. `limit` carries N.
const scrapeTaskSchema = new mongoose.Schema({
  type: { type: String, enum: ['jobs', 'range', 'single', 'website'], default: 'jobs' },
  startPin: { type: String, default: '' },
  endPin: { type: String, default: '' },
  jobs: { type: Number, default: 3 },
  limit: { type: Number, default: 100 },     // total websites for website-type task
  workers: { type: Number, default: 4 },     // parallel CLI workers for website-type task
}, { _id: false });

const deviceSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true, unique: true },
    nickname: { type: String, trim: true, default: '' },
    hostname: { type: String, trim: true },
    username: { type: String, trim: true },
    platform: { type: String },
    osVersion: { type: String },
    arch: { type: String },
    cpuModel: { type: String },
    cpuCores: { type: Number },
    totalMemoryGB: { type: Number },
    macAddresses: [{ type: String }],
    networkInterfaces: { type: mongoose.Schema.Types.Mixed },
    ip: { type: String, trim: true, default: '' },        // first registration IP
    ips: [{ type: String, trim: true }],                    // all unique IPs (accumulated)
    isActive: { type: Boolean, default: true },
    isArchived: { type: Boolean, default: false },
    archivedAt: { type: Date, default: null },
    vpsPassword: { type: String, default: '' },
    // Legacy (kept for backward compat)
    scrapePincode: { type: String, default: '' },
    scrapeJobs: { type: Number, default: 3 },
    // New: array of scrape tasks — each runs as a separate pm2 process
    // type 'jobs': N multi-jobs from startPin (same as CLI arg < 1000)
    // type 'range': scrape startPin → endPin
    // type 'single': scrape just startPin (1 pincode)
    scrapeTasks: { type: [scrapeTaskSchema], default: [] },
    status: { type: String, enum: ['online', 'offline'], default: 'offline' },
    lastSeenAt: { type: Date, default: Date.now },

    // Latest system stats (updated every ~30s from device-history)
    latestStats: {
      cpuUsedPercent:  { type: Number, default: 0 },
      ramTotalMB:      { type: Number, default: 0 },
      ramUsedMB:       { type: Number, default: 0 },
      ramUsedPercent:  { type: Number, default: 0 },
      diskTotalGB:     { type: Number, default: 0 },
      diskUsedGB:      { type: Number, default: 0 },
      diskUsedPercent: { type: Number, default: 0 },
      networkSentMB:   { type: Number, default: 0 },
      networkRecvMB:   { type: Number, default: 0 },
      netDownKBps:     { type: Number, default: 0 },
      netUpKBps:       { type: Number, default: 0 },
      updatedAt:       { type: Date },
    },
  },
  {
    collection: 'Devices',
    timestamps: true,
  }
);

module.exports = mongoose.model('Device', deviceSchema);
