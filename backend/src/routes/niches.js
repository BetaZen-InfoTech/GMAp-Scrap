const express = require('express');
const router = express.Router();
const BusinessNiche = require('../models/BusinessNiche');

// GET /api/niches
router.get('/', async (req, res) => {
  try {
    const niches = await BusinessNiche.find(
      {},
      { Category: 1, SubCategory: 1, _id: 0 }
    ).sort({ Category: 1, SubCategory: 1 });

    res.json(niches);
  } catch (err) {
    console.error('[niches] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
