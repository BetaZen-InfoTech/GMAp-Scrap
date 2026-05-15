const mongoose = require('mongoose');

const scrapeTaskSchema = new mongoose.Schema({
  type: { type: String, enum: ['jobs', 'range', 'single', 'website'], default: 'jobs' },
  startPin: { type: String, default: '' },
  endPin: { type: String, default: '' },
  jobs: { type: Number, default: 3 },
  limit: { type: Number, default: 100 },
  workers: { type: Number, default: 4 },
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
    ip: { type: String, trim: true, default: '' },
    ips: [{ type: String, trim: true }],
    isActive: { type: Boolean, default: true },
    isArchived: { type: Boolean, default: false },
    archivedAt: { type: Date, default: null },
    vpsPassword: { type: String, default: '' },
    scrapePincode: { type: String, default: '' },
    scrapeJobs: { type: Number, default: 3 },
    scrapeTasks: { type: [scrapeTaskSchema], default: [] },
    status: { type: String, enum: ['online', 'offline'], default: 'offline' },
    lastSeenAt: { type: Date, default: Date.now },

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
