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
    lastSeenAt: { type: Date, default: Date.now },
  },
  {
    collection: 'Devices',
    timestamps: true,
  }
);

module.exports = mongoose.model('Device', deviceSchema);
