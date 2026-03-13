const mongoose = require('mongoose');

const pinCodeSchema = new mongoose.Schema(
  {
    CircleName: { type: String, trim: true },
    Pincode: { type: Number, required: true },
    District: { type: String, trim: true },
    StateName: { type: String, trim: true },
    Latitude: { type: String },
    Longitude: { type: String },
    Country: { type: String, default: 'India' },
  },
  {
    collection: 'PinCode-Dataset',
    timestamps: true,
  }
);

module.exports = mongoose.model('PinCode', pinCodeSchema);
