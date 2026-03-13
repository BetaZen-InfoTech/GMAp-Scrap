const mongoose = require('mongoose');

const businessNicheSchema = new mongoose.Schema(
  {
    Category: { type: String, required: true, trim: true },
    SubCategory: { type: String, required: true, trim: true },
  },
  {
    collection: 'Business-Niches',
    timestamps: true,
  }
);

module.exports = mongoose.model('BusinessNiche', businessNicheSchema);
