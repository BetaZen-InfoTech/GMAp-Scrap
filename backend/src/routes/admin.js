const express = require('express');
const router = express.Router();
const { adminAuth, validTokens, ADMIN_PASSWORD, generateToken } = require('../middleware/adminAuth');

const Device = require('../models/Device');
const DeviceHistory = require('../models/DeviceHistory');
const SessionStats = require('../models/SessionStats');
const ScrapeTracking = require('../models/ScrapeTracking');
const ScrapedData = require('../models/ScrapedData');

// ── POST /api/admin/login ──
router.post('/login', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ success: false, error: 'Invalid admin password' });
    }
    const token = generateToken();
    validTokens.add(token);
    res.json({ success: true, token });
  } catch (err) {
    console.error('[admin/login] Error:', err.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// All routes below require admin auth
router.use(adminAuth);

// ── GET /api/admin/devices ──
router.get('/devices', async (req, res) => {
  try {
    const devices = await Device.find().sort({ lastSeenAt: -1 }).lean();

    // Get today's date for latest stats lookup
    const today = new Date().toISOString().split('T')[0];

    // Fetch latest stats for all devices
    const historyDocs = await DeviceHistory.find(
      { date: today },
      { deviceId: 1, stats: { $slice: -1 } }
    ).lean();

    const statsMap = {};
    for (const doc of historyDocs) {
      if (doc.stats && doc.stats.length > 0) {
        statsMap[doc.deviceId] = doc.stats[0];
      }
    }

    // Get active job counts per device
    const activeJobs = await ScrapeTracking.aggregate([
      { $match: { status: { $in: ['running', 'paused'] } } },
      { $group: { _id: '$deviceId', count: { $sum: 1 } } },
    ]);
    const jobCountMap = {};
    for (const j of activeJobs) {
      jobCountMap[j._id] = j.count;
    }

    // Get total session counts per device
    const sessionCounts = await SessionStats.aggregate([
      { $group: { _id: '$deviceId', total: { $sum: 1 } } },
    ]);
    const sessionCountMap = {};
    for (const s of sessionCounts) {
      sessionCountMap[s._id] = s.total;
    }

    const result = devices.map((d) => ({
      ...d,
      latestStats: statsMap[d.deviceId] || null,
      activeJobs: jobCountMap[d.deviceId] || 0,
      totalSessions: sessionCountMap[d.deviceId] || 0,
    }));

    res.json(result);
  } catch (err) {
    console.error('[admin/devices] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/admin/devices/:deviceId ──
router.get('/devices/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;

    const device = await Device.findOne({ deviceId }).lean();
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const today = new Date().toISOString().split('T')[0];
    const [sessions, jobs, history, todayHistory] = await Promise.all([
      SessionStats.find({ deviceId }).sort({ createdAt: -1 }).limit(100).lean(),
      ScrapeTracking.find({ deviceId }).sort({ createdAt: -1 }).limit(50).lean(),
      DeviceHistory.find({ deviceId }).sort({ date: -1 }).limit(7).lean(),
      DeviceHistory.findOne({ deviceId, date: today }, { stats: { $slice: -1 } }).lean(),
    ]);

    const latestStats = todayHistory?.stats?.[0] || null;
    const activeJobs = jobs.filter((j) => j.status === 'running' || j.status === 'paused').length;
    const deviceName = device.nickname || device.hostname;
    const enrichedSessions = sessions.map((s) => ({ ...s, deviceName }));

    res.json({
      device: { ...device, latestStats, activeJobs, totalSessions: sessions.length },
      sessions: enrichedSessions,
      jobs,
      history,
    });
  } catch (err) {
    console.error('[admin/devices/:id] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/admin/sessions ──
router.get('/sessions', async (req, res) => {
  try {
    const { deviceId, status, keyword, from, to, page = 1, limit = 25 } = req.query;
    const filter = {};

    if (deviceId) filter.deviceId = deviceId;
    if (status) filter.status = status;
    if (keyword) filter.keyword = { $regex: keyword, $options: 'i' };
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
      SessionStats.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      SessionStats.countDocuments(filter),
    ]);

    // Enrich with device names
    const deviceIds = [...new Set(data.map((s) => s.deviceId).filter(Boolean))];
    const deviceDocs = await Device.find({ deviceId: { $in: deviceIds } }, { deviceId: 1, hostname: 1, nickname: 1 }).lean();
    const nameMap = {};
    for (const d of deviceDocs) nameMap[d.deviceId] = d.nickname || d.hostname;

    const enriched = data.map((s) => ({ ...s, deviceName: nameMap[s.deviceId] || s.deviceId || '—' }));

    res.json({ data: enriched, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('[admin/sessions] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/admin/jobs ──
router.get('/jobs', async (req, res) => {
  try {
    const { deviceId, status } = req.query;
    const filter = {};
    if (deviceId) filter.deviceId = deviceId;
    if (status) filter.status = status;

    const jobs = await ScrapeTracking.find(filter).sort({ createdAt: -1 }).lean();
    res.json(jobs);
  } catch (err) {
    console.error('[admin/jobs] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/admin/analytics ──
router.get('/analytics', async (req, res) => {
  try {
    const [
      totalRecords,
      duplicateRecords,
      activeDevices,
      inactiveDevices,
      recordsPerDevice,
      topPincodes,
      topCategories,
      sessionStats,
      jobsRunning,
      jobsCompleted,
      pincodesCovered,
    ] = await Promise.all([
      ScrapedData.countDocuments(),
      ScrapedData.countDocuments({ isDuplicate: true }),
      Device.countDocuments({ isActive: true }),
      Device.countDocuments({ isActive: false }),
      ScrapedData.aggregate([
        { $group: { _id: '$deviceId', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 },
      ]),
      ScrapedData.aggregate([
        { $match: { pincode: { $ne: null, $exists: true } } },
        { $group: { _id: '$pincode', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 50 },
      ]),
      ScrapedData.aggregate([
        { $match: { category: { $ne: null, $exists: true } } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 30 },
      ]),
      SessionStats.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
            avgDurationMs: { $avg: '$durationMs' },
          },
        },
      ]),
      ScrapeTracking.countDocuments({ status: { $in: ['running', 'paused'] } }),
      ScrapeTracking.countDocuments({ status: 'completed' }),
      ScrapedData.distinct('pincode', { pincode: { $ne: null } }),
    ]);

    // Enrich recordsPerDevice with hostnames + nicknames
    const deviceIds = recordsPerDevice.map((r) => r._id).filter(Boolean);
    const deviceDocs = await Device.find(
      { deviceId: { $in: deviceIds } },
      { deviceId: 1, hostname: 1, nickname: 1 }
    ).lean();
    const hostMap = {};
    for (const d of deviceDocs) hostMap[d.deviceId] = d.nickname || d.hostname;

    const sessionStat = sessionStats[0] || { total: 0, completed: 0, avgDurationMs: 0 };

    res.json({
      totalRecords,
      duplicateRecords,
      duplicateRate: totalRecords > 0 ? parseFloat(((duplicateRecords / totalRecords) * 100).toFixed(1)) : 0,
      activeDevices,
      inactiveDevices,
      recordsPerDevice: recordsPerDevice.map((r) => ({
        deviceId: r._id || 'unknown',
        hostname: hostMap[r._id] || r._id || 'unknown',
        count: r.count,
      })),
      topPincodes: topPincodes.map((r) => ({ pincode: r._id, count: r.count })),
      topCategories: topCategories.map((r) => ({ category: r._id, count: r.count })),
      sessionCompletionRate:
        sessionStat.total > 0
          ? parseFloat(((sessionStat.completed / sessionStat.total) * 100).toFixed(1))
          : 0,
      avgSessionDurationMs: Math.round(sessionStat.avgDurationMs || 0),
      jobsInProgress: jobsRunning,
      jobsCompleted,
      pincodesCovered: Array.isArray(pincodesCovered) ? pincodesCovered.length : 0,
    });
  } catch (err) {
    console.error('[admin/analytics] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
