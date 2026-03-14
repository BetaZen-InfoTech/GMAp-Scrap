const express = require('express');
const router = express.Router();
const { adminAuth, validTokens, ADMIN_PASSWORD, generateToken } = require('../middleware/adminAuth');

const Device = require('../models/Device');
const DeviceHistory = require('../models/DeviceHistory');
const SessionStats = require('../models/SessionStats');
const ScrapeTracking = require('../models/ScrapeTracking');
const ScrapedData = require('../models/ScrapedData');
const BusinessNiche = require('../models/BusinessNiche');

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
    // Auto-discover devices from Session-Stats & Device-History that aren't in Devices collection
    const [sessionDeviceIds, historyDeviceIds] = await Promise.all([
      SessionStats.distinct('deviceId', { deviceId: { $ne: null, $exists: true, $ne: '' } }),
      DeviceHistory.distinct('deviceId', { deviceId: { $ne: null, $exists: true, $ne: '' } }),
    ]);

    const allKnownIds = [...new Set([...sessionDeviceIds, ...historyDeviceIds])].filter(Boolean);

    if (allKnownIds.length > 0) {
      const existingIds = (await Device.find({ deviceId: { $in: allKnownIds } }, { deviceId: 1 }).lean())
        .map((d) => d.deviceId);

      const missingIds = allKnownIds.filter((id) => !existingIds.includes(id));

      if (missingIds.length > 0) {
        const newDevices = missingIds.map((id) => ({
          deviceId: id,
          nickname: '',
          hostname: 'Discovered Device',
          platform: 'unknown',
          isActive: true,
          lastSeenAt: new Date(),
        }));
        await Device.insertMany(newDevices, { ordered: false }).catch(() => {});
      }
    }

    // Also create a placeholder for sessions without any deviceId
    const orphanCount = await SessionStats.countDocuments({
      $or: [{ deviceId: null }, { deviceId: '' }, { deviceId: { $exists: false } }],
    });

    if (orphanCount > 0) {
      const placeholderId = 'unregistered-device';
      const exists = await Device.findOne({ deviceId: placeholderId });
      if (!exists) {
        await Device.create({
          deviceId: placeholderId,
          nickname: 'Unregistered Device',
          hostname: 'Unknown',
          platform: 'unknown',
          isActive: true,
          lastSeenAt: new Date(),
        });
        // Tag orphan sessions with this placeholder deviceId
        await SessionStats.updateMany(
          { $or: [{ deviceId: null }, { deviceId: '' }, { deviceId: { $exists: false } }] },
          { $set: { deviceId: placeholderId } }
        );
        await ScrapedData.updateMany(
          { $or: [{ deviceId: null }, { deviceId: '' }, { deviceId: { $exists: false } }] },
          { $set: { deviceId: placeholderId } }
        );
      }
    }

    const devices = await Device.find().sort({ lastSeenAt: -1 }).lean();

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

    let device = await Device.findOne({ deviceId }).lean();
    if (!device) {
      // Try to create from known data
      const hasHistory = await DeviceHistory.findOne({ deviceId });
      const hasSessions = await SessionStats.findOne({ deviceId });
      if (hasHistory || hasSessions) {
        await Device.create({
          deviceId,
          nickname: '',
          hostname: 'Discovered Device',
          platform: 'unknown',
          isActive: true,
          lastSeenAt: new Date(),
        });
        device = await Device.findOne({ deviceId }).lean();
      }
      if (!device) {
        return res.status(404).json({ error: 'Device not found' });
      }
    }

    const [sessions, jobs, history] = await Promise.all([
      SessionStats.find({ deviceId }).sort({ createdAt: -1 }).limit(100).lean(),
      ScrapeTracking.find({ deviceId }).sort({ createdAt: -1 }).limit(50).lean(),
      DeviceHistory.find({ deviceId }).sort({ date: -1 }).limit(7).lean(),
    ]);

    const activeJobs = jobs.filter((j) => j.status === 'running' || j.status === 'paused').length;
    const deviceName = device.nickname || device.hostname;
    const enrichedSessions = sessions.map((s) => ({ ...s, deviceName }));

    res.json({
      device: { ...device, activeJobs, totalSessions: sessions.length },
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

// ── GET /api/admin/categories ──
// Returns all unique scraped categories with record counts + all BusinessNiche categories
router.get('/categories', async (req, res) => {
  try {
    const [scrapedAgg, niches] = await Promise.all([
      ScrapedData.aggregate([
        { $match: { category: { $ne: null, $exists: true, $ne: '' } } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      BusinessNiche.find().sort({ Category: 1, SubCategory: 1 }).lean(),
    ]);

    // Build map of scraped counts
    const countMap = {};
    for (const row of scrapedAgg) {
      countMap[row._id] = row.count;
    }

    // Combine: all niches + any scraped categories not in niches
    const nicheCategories = [...new Set(niches.map((n) => n.Category))];
    const scrapedOnlyCategories = scrapedAgg
      .map((r) => r._id)
      .filter((c) => !nicheCategories.includes(c));

    const categories = [
      ...nicheCategories.map((c) => ({
        category: c,
        count: countMap[c] || 0,
        inNiches: true,
        subCategories: niches.filter((n) => n.Category === c).map((n) => ({ id: n._id, subCategory: n.SubCategory })),
      })),
      ...scrapedOnlyCategories.map((c) => ({
        category: c,
        count: countMap[c] || 0,
        inNiches: false,
        subCategories: [],
      })),
    ].sort((a, b) => b.count - a.count);

    res.json({ categories, total: categories.length });
  } catch (err) {
    console.error('[admin/categories] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/admin/categories/:category/records ──
// Returns paginated scraped records for a specific category
router.get('/categories/:category/records', async (req, res) => {
  try {
    const { category } = req.params;
    const { page = 1, limit = 25 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const filter = { category };
    const [data, total] = await Promise.all([
      ScrapedData.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .select('name phone address rating reviews pincode plusCode website isDuplicate scrapedAt deviceId')
        .lean(),
      ScrapedData.countDocuments(filter),
    ]);

    res.json({ data, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('[admin/categories/:category/records] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/admin/categories ──
// Add a new Category + SubCategory to BusinessNiche
router.post('/categories', async (req, res) => {
  try {
    const { category, subCategory } = req.body;
    if (!category || !subCategory) {
      return res.status(400).json({ error: 'category and subCategory are required' });
    }

    const existing = await BusinessNiche.findOne({
      Category: category.trim(),
      SubCategory: subCategory.trim(),
    });
    if (existing) {
      return res.status(409).json({ error: 'This category + sub-category pair already exists' });
    }

    const niche = await BusinessNiche.create({
      Category: category.trim(),
      SubCategory: subCategory.trim(),
    });

    res.status(201).json({ success: true, id: niche._id });
  } catch (err) {
    console.error('[admin/categories POST] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── DELETE /api/admin/categories/:category ──
// Delete all BusinessNiche entries for a Category
router.delete('/categories/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const result = await BusinessNiche.deleteMany({ Category: category });
    res.json({ success: true, deleted: result.deletedCount });
  } catch (err) {
    console.error('[admin/categories DELETE] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── DELETE /api/admin/categories/:category/niches/:nicheId ──
// Delete a single SubCategory entry from BusinessNiche
router.delete('/categories/:category/niches/:nicheId', async (req, res) => {
  try {
    const { nicheId } = req.params;
    await BusinessNiche.findByIdAndDelete(nicheId);
    res.json({ success: true });
  } catch (err) {
    console.error('[admin/categories/niches DELETE] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
