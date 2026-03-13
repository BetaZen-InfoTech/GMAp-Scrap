const express = require('express');
const router = express.Router();
const ScrapeTracking = require('../models/ScrapeTracking');
const SearchStatus = require('../models/SearchStatus');

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
router.get('/:deviceId', async (req, res) => {
  try {
    const doc = await ScrapeTracking.findOne(
      { deviceId: req.params.deviceId },
      null,
      { sort: { createdAt: -1 } }
    );
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
      { jobId: req.params.jobId },
      { $set: update },
      { new: true }
    );

    if (!doc) return res.status(404).json({ error: 'Job not found' });
    res.json(doc);
  } catch (err) {
    console.error('[scrape-tracking PATCH] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/scrape-tracking/:jobId/completed-searches — get all completed searches for a job
router.get('/:jobId/completed-searches', async (req, res) => {
  try {
    const docs = await SearchStatus.find(
      { jobId: req.params.jobId, status: 'completed' },
      { pincode: 1, category: 1, subCategory: 1, round: 1, _id: 0 }
    ).lean();
    res.json(docs);
  } catch (err) {
    console.error('[completed-searches GET] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/scrape-tracking/:jobId/search-complete — mark a single search as completed
router.post('/:jobId/search-complete', async (req, res) => {
  try {
    const { deviceId, pincode, district, stateName, category, subCategory, round, sessionId } = req.body;

    if (pincode == null || !category || !subCategory || round == null) {
      return res.status(400).json({ error: 'pincode, category, subCategory, round are required' });
    }

    const doc = await SearchStatus.findOneAndUpdate(
      {
        jobId: req.params.jobId,
        pincode,
        category,
        subCategory,
        round,
      },
      {
        $set: {
          deviceId,
          district,
          stateName,
          sessionId,
          status: 'completed',
        },
      },
      { upsert: true, new: true }
    );

    res.status(201).json(doc);
  } catch (err) {
    console.error('[search-complete POST] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
