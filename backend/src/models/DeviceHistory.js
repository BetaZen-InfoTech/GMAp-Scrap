const mongoose = require('mongoose');

const statSnapshotSchema = new mongoose.Schema(
  {
    timestamp: { type: Date, required: true },
    ramTotalMB: { type: Number },
    ramUsedMB: { type: Number },
    ramUsedPercent: { type: Number },
    diskTotalGB: { type: Number },
    diskUsedGB: { type: Number },
    diskUsedPercent: { type: Number },
    networkSentMB: { type: Number },
    networkRecvMB: { type: Number },
  },
  { _id: false }
);

const deviceHistorySchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true },
    date: { type: String, required: true }, // YYYY-MM-DD — one doc per device per day
    stats: [statSnapshotSchema],
  },
  {
    collection: 'Device-History',
    timestamps: true,
  }
);

deviceHistorySchema.index({ deviceId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('DeviceHistory', deviceHistorySchema);
