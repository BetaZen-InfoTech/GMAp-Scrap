const express = require('express');
const router = express.Router();
const DeviceHistory = require('../models/DeviceHistory');

// POST /api/device-history — receive batch of stat snapshots
router.post('/', async (req, res) => {
  try {
    const { deviceId, stats } = req.body;
    if (!deviceId || !Array.isArray(stats) || stats.length === 0) {
      return res.status(400).json({ error: 'deviceId and non-empty stats array are required' });
    }

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // Upsert: push stats into today's document for this device
    const result = await DeviceHistory.findOneAndUpdate(
      { deviceId, date: today },
      { $push: { stats: { $each: stats } } },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      date: today,
      totalSnapshots: result.stats.length,
    });
  } catch (err) {
    console.error('[device-history POST] Error:', err.message);
    res.status(500).json({ error: 'Server error', message: err.message });
  }
});

// GET /api/device-history/:deviceId — get recent history (last 7 days)
router.get('/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const docs = await DeviceHistory.find({ deviceId })
      .sort({ date: -1 })
      .limit(7)
      .lean();

    res.json(docs);
  } catch (err) {
    console.error('[device-history GET] Error:', err.message);
    res.status(500).json({ error: 'Server error', message: err.message });
  }
});

module.exports = router;
