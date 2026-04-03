const express = require('express');
const router = express.Router();
const ScrapeTracking = require('../models/ScrapeTracking');
const SearchStatus = require('../models/SearchStatus');

// POST /api/scrape-tracking/completed-searches-global — get all completed searches (across all jobs)
// Body: { pincodes: [700001, 700002, ...] } — filter by pincodes for efficiency
router.post('/completed-searches-global', async (req, res) => {
  try {
    const { pincodes } = req.body;
    const filter = { status: 'completed' };
    if (Array.isArray(pincodes) && pincodes.length > 0) {
      filter.pincode = { $in: pincodes };
    }
    // Return both rounds (new) and round (old) so CLI can handle both formats
    const docs = await SearchStatus.find(
      filter,
      { pincode: 1, category: 1, subCategory: 1, rounds: 1, round: 1, _id: 0 }
    ).lean();
    res.json(docs);
  } catch (err) {
    console.error('[completed-searches-global POST] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/scrape-tracking — create new job tracking doc
router.post('/', async (req, res) => {
  try {
    const {
      jobId,
      deviceId,
      startPincode,
      endPincode,
      totalSearches,
    } = req.body;

    if (!jobId || !deviceId || startPincode == null || endPincode == null) {
      return res.status(400).json({ error: 'jobId, deviceId, startPincode, endPincode are required' });
    }

    const doc = await ScrapeTracking.create({
      jobId,
      deviceId,
      startPincode,
      endPincode,
      totalSearches: totalSearches ?? 0,
      completedSearches: 0,
      pincodeIndex: 0,
      nicheIndex: 0,
      round: 1,
      status: 'running',
    });

    res.status(201).json(doc);
  } catch (err) {
    console.error('[scrape-tracking POST] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/scrape-tracking/:deviceId — get latest job for device
// Optional query params: startPincode, endPincode — for multi-job resume matching
router.get('/:deviceId', async (req, res) => {
  try {
    const filter = { deviceId: req.params.deviceId };
    const { startPincode, endPincode } = req.query;
    if (startPincode != null) filter.startPincode = Number(startPincode);
    if (endPincode != null) filter.endPincode = Number(endPincode);

    const doc = await ScrapeTracking.findOne(filter, null, { sort: { createdAt: -1 } });
    if (!doc) return res.status(404).json({ error: 'No job found for this device' });
    res.json(doc);
  } catch (err) {
    console.error('[scrape-tracking GET] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/scrape-tracking/:jobId — update progress fields
router.patch('/:jobId', async (req, res) => {
  try {
    const allowed = ['pincodeIndex', 'nicheIndex', 'round', 'completedSearches', 'status'];
    const update = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }

    const doc = await ScrapeTracking.findOneAndUpdate(
      { jobId: req.params.jobId, status: { $ne: 'completed' } },
      { $set: update },
      { new: true }
    );

    if (!doc) {
      // Could be not found OR already completed — return current doc
      const existing = await ScrapeTracking.findOne({ jobId: req.params.jobId }).lean();
      if (!existing) return res.status(404).json({ error: 'Job not found' });
      return res.json(existing);
    }
    res.json(doc);
  } catch (err) {
    console.error('[scrape-tracking PATCH] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/scrape-tracking/:jobId/completed-searches — get all completed searches for a job
// Returns docs with rounds array — CLI expands them into individual search keys
router.get('/:jobId/completed-searches', async (req, res) => {
  try {
    const docs = await SearchStatus.find(
      { jobId: req.params.jobId, status: 'completed' },
      { pincode: 1, category: 1, subCategory: 1, rounds: 1, _id: 0 }
    ).lean();
    res.json(docs);
  } catch (err) {
    console.error('[completed-searches GET] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/scrape-tracking/:jobId/search-complete — mark a single search as completed
// Single doc per (pincode, category, subCategory) — rounds tracked as array [1,2,3]
router.post('/:jobId/search-complete', async (req, res) => {
  try {
    const { deviceId, pincode, district, stateName, category, subCategory, round, sessionId } = req.body;

    if (pincode == null || !category || !subCategory || round == null) {
      return res.status(400).json({ error: 'pincode, category, subCategory, round are required' });
    }

    // Find existing doc — may have old `round` field that needs migrating
    const existing = await SearchStatus.findOne({ pincode, category, subCategory }).lean();

    const updateOps = {
      $set: {
        jobId: req.params.jobId,
        deviceId,
        district,
        stateName,
        sessionId,
        status: 'completed',
      },
      $addToSet: { rounds: round },
      $unset: { round: '' },
    };

    // Migrate old `round` field into `rounds` array
    if (existing?.round != null && (!existing.rounds || !existing.rounds.includes(existing.round))) {
      // Use $addToSet with $each to add both old round and new round
      updateOps.$addToSet = { rounds: { $each: [existing.round, round] } };
    }

    const doc = await SearchStatus.findOneAndUpdate(
      { pincode, category, subCategory },
      updateOps,
      { upsert: true, new: true }
    );

    res.status(201).json(doc);
  } catch (err) {
    console.error('[search-complete POST] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
