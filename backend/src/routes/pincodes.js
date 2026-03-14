const express = require('express');
const router = express.Router();
const PinCode = require('../models/PinCode');

// GET /api/pincodes/range?start=N&end=N&limit=N
router.get('/range', async (req, res) => {
  try {
    const start = parseInt(req.query.start, 10);
    const end = parseInt(req.query.end, 10);
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 0;

    if (isNaN(start) || isNaN(end)) {
      return res.status(400).json({ error: 'start and end query params must be numbers' });
    }
    if (start > end) {
      return res.status(400).json({ error: 'start must be <= end' });
    }

    const raw = await PinCode.find(
      { Pincode: { $gte: start, $lte: end } },
      { Pincode: 1, District: 1, StateName: 1, _id: 0 }
    ).sort({ Pincode: 1 });

    // Deduplicate — keep first occurrence per unique Pincode
    const seen = new Set();
    const pincodes = [];
    for (const doc of raw) {
      if (!seen.has(doc.Pincode)) {
        seen.add(doc.Pincode);
        pincodes.push({
          Pincode: doc.Pincode,
          District: doc.District,
          StateName: doc.StateName,
        });
        // Stop early if limit reached
        if (limit > 0 && pincodes.length >= limit) break;
      }
    }

    res.json(pincodes);
  } catch (err) {
    console.error('[pincodes/range] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
