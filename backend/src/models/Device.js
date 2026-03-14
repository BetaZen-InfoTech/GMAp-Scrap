const mongoose = require('mongoose');

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
    isActive: { type: Boolean, default: true },
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
