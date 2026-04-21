const express = require('express');
const router = express.Router();
const { adminAuth, validTokens, ADMIN_PASSWORD, generateToken } = require('../middleware/adminAuth');

const Device = require('../models/Device');
const DeviceHistory = require('../models/DeviceHistory');
const SessionStats = require('../models/SessionStats');
const ScrapeTracking = require('../models/ScrapeTracking');
const ScrapedData = require('../models/ScrapedData');
const ScrapedDataDuplicate = require('../models/ScrapedDataDuplicate');
const ScrapedDataDeleted = require('../models/ScrapedDataDeleted');
const PincodeStatus = require('../models/PincodeStatus');
const BusinessNiche = require('../models/BusinessNiche');
const PinCode = require('../models/PinCode');
const SearchStatus = require('../models/SearchStatus');

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

    const deviceFilter = req.query.includeArchived === 'true' ? {} : { isArchived: { $ne: true } };
    const devices = await Device.find(deviceFilter).sort({ createdAt: 1 }).lean();

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

    // ── 60-minute analytics per device ──
    const sixtyMinAgo = new Date(Date.now() - 60 * 60 * 1000);

    // Scraped data in last 60 min — total records + per 10-min buckets
    const [recentRecords, recentSessions] = await Promise.all([
      ScrapedData.aggregate([
        { $match: { createdAt: { $gte: sixtyMinAgo } } },
        {
          $group: {
            _id: '$deviceId',
            totalRecords: { $sum: 1 },
            // 10-min bucket: floor(minutesAgo / 10)
            buckets: {
              $push: {
                $floor: { $divide: [{ $subtract: [new Date(), '$createdAt'] }, 600000] },
              },
            },
          },
        },
      ]),
      // Sessions completed in last 60 min
      SessionStats.aggregate([
        { $match: { createdAt: { $gte: sixtyMinAgo }, status: 'completed' } },
        {
          $group: {
            _id: '$deviceId',
            totalSessions60: { $sum: 1 },
            totalRecords60: { $sum: '$totalRecords' },
            buckets: {
              $push: {
                $floor: { $divide: [{ $subtract: [new Date(), '$createdAt'] }, 600000] },
              },
            },
          },
        },
      ]),
    ]);

    const recentRecordsMap = {};
    for (const r of recentRecords) {
      const bucketCounts = [0, 0, 0, 0, 0, 0]; // 6 x 10-min buckets
      for (const b of r.buckets) { if (b >= 0 && b < 6) bucketCounts[b]++; }
      recentRecordsMap[r._id] = {
        total: r.totalRecords,
        avg10min: Math.round(r.totalRecords / 6),
        buckets: bucketCounts,
      };
    }

    const recentSessionsMap = {};
    for (const s of recentSessions) {
      const bucketCounts = [0, 0, 0, 0, 0, 0];
      for (const b of s.buckets) { if (b >= 0 && b < 6) bucketCounts[b]++; }
      recentSessionsMap[s._id] = {
        total: s.totalSessions60,
        totalRecords: s.totalRecords60,
        avg10min: Math.round(s.totalSessions60 / 6),
        buckets: bucketCounts,
      };
    }

    // ── Compute task completion status per device ──
    // Pull all ScrapeTracking docs for these devices (latest per deviceId+startPincode)
    const deviceIds = devices.map((d) => d.deviceId);
    const trackingDocs = await ScrapeTracking.find(
      { deviceId: { $in: deviceIds } },
      { deviceId: 1, startPincode: 1, endPincode: 1, status: 1, completedSearches: 1, totalSearches: 1, updatedAt: 1 }
    ).sort({ updatedAt: -1 }).lean();

    // Build map: deviceId → array of tracking records (sorted newest first)
    const trackingByDevice = {};
    for (const doc of trackingDocs) {
      if (!trackingByDevice[doc.deviceId]) trackingByDevice[doc.deviceId] = [];
      trackingByDevice[doc.deviceId].push(doc);
    }

    // Match a scrape task to the most recent ScrapeTracking doc
    const matchTaskProgress = (deviceId, task) => {
      const tracks = trackingByDevice[deviceId] || [];
      const startPin = Number(task.startPin);
      if (!startPin) return null;

      let match;
      if (task.type === 'range') {
        const endPin = Number(task.endPin);
        match = tracks.find((t) => t.startPincode === startPin && t.endPincode === endPin);
      } else if (task.type === 'single') {
        match = tracks.find((t) => t.startPincode === startPin && t.endPincode === startPin);
      } else {
        // 'jobs' type: startPincode matches, endPincode varies by actual pincode count
        match = tracks.find((t) => t.startPincode === startPin);
      }
      if (!match) return null;
      const pct = match.totalSearches > 0
        ? Math.round((match.completedSearches / match.totalSearches) * 100)
        : 0;
      return {
        status: match.status,
        completedSearches: match.completedSearches,
        totalSearches: match.totalSearches,
        percent: pct,
        completedAt: match.status === 'completed' ? match.updatedAt : null,
      };
    };

    const result = devices.map((d) => {
      const tasksWithProgress = (d.scrapeTasks || []).map((t) => ({
        ...(typeof t.toObject === 'function' ? t.toObject() : t),
        progress: matchTaskProgress(d.deviceId, t),
      }));
      return {
        ...d,
        scrapeTasks: tasksWithProgress,
        activeJobs: jobCountMap[d.deviceId] || 0,
        totalSessions: sessionCountMap[d.deviceId] || 0,
        recent: {
          records: recentRecordsMap[d.deviceId] || { total: 0, avg10min: 0, buckets: [0,0,0,0,0,0] },
          sessions: recentSessionsMap[d.deviceId] || { total: 0, totalRecords: 0, avg10min: 0, buckets: [0,0,0,0,0,0] },
        },
      };
    });

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

    const sessionPage = Math.max(1, Number(req.query.sessionPage) || 1);
    const sessionLimit = Math.min(500, Math.max(1, Number(req.query.sessionLimit) || 50));
    const jobPage = Math.max(1, Number(req.query.jobPage) || 1);
    const jobLimit = Math.min(500, Math.max(1, Number(req.query.jobLimit) || 50));

    const sessionSkip = (sessionPage - 1) * sessionLimit;
    const jobSkip = (jobPage - 1) * jobLimit;

    const [sessions, jobs, history, totalSessions, totalJobs, activeJobCount] = await Promise.all([
      SessionStats.find({ deviceId }).sort({ createdAt: -1 }).skip(sessionSkip).limit(sessionLimit).lean(),
      ScrapeTracking.find({ deviceId }).sort({ createdAt: -1 }).skip(jobSkip).limit(jobLimit).lean(),
      DeviceHistory.find({ deviceId }).sort({ date: -1 }).limit(7).lean(),
      SessionStats.countDocuments({ deviceId }),
      ScrapeTracking.countDocuments({ deviceId }),
      ScrapeTracking.countDocuments({ deviceId, status: { $in: ['running', 'paused'] } }),
    ]);

    const deviceName = device.nickname || device.hostname;
    const enrichedSessions = sessions.map((s) => ({ ...s, deviceName }));

    res.json({
      device: { ...device, activeJobs: activeJobCount, totalSessions },
      sessions: enrichedSessions,
      jobs,
      history,
      totalSessions,
      totalJobs,
      sessionPage,
      sessionLimit,
      jobPage,
      jobLimit,
    });
  } catch (err) {
    console.error('[admin/devices/:id] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/admin/devices/add ── manually add a VPS device
router.post('/devices/add', adminAuth, async (req, res) => {
  try {
    const { ip, password, pincode, jobs } = req.body;
    if (!ip) return res.status(400).json({ error: 'IP is required' });

    // Check if device with this IP already exists
    const existing = await Device.findOne({ $or: [{ ip }, { ips: ip }] });
    if (existing) {
      // Update existing device
      if (password) existing.vpsPassword = password;
      if (pincode !== undefined) existing.scrapePincode = String(pincode);
      if (jobs !== undefined) existing.scrapeJobs = Number(jobs) || 3;
      await existing.save();
      return res.json({ success: true, deviceId: existing.deviceId, updated: true });
    }

    // Create new device with minimal info — details auto-fill when scraper starts
    const crypto = require('crypto');
    const deviceId = crypto.randomUUID();
    const device = await Device.create({
      deviceId,
      nickname: ip,
      hostname: 'Pending setup',
      username: 'root',
      platform: 'linux',
      ip,
      ips: [ip],
      isActive: true,
      status: 'offline',
      vpsPassword: password || '',
      scrapePincode: pincode ? String(pincode) : '',
      scrapeJobs: jobs || 3,
      lastSeenAt: new Date(),
    });

    res.status(201).json({ success: true, deviceId: device.deviceId });
  } catch (err) {
    console.error('[admin/devices/add] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PATCH /api/admin/devices/:deviceId/archive ── toggle archive status
router.patch('/devices/:deviceId/archive', adminAuth, async (req, res) => {
  try {
    const device = await Device.findOne({ deviceId: req.params.deviceId });
    if (!device) return res.status(404).json({ error: 'Device not found' });

    device.isArchived = !device.isArchived;
    device.archivedAt = device.isArchived ? new Date() : null;
    await device.save();

    res.json({ success: true, isArchived: device.isArchived });
  } catch (err) {
    console.error('[admin/devices/archive] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PATCH /api/admin/devices/:deviceId/vps-password ── save VPS password
router.patch('/devices/:deviceId/vps-password', adminAuth, async (req, res) => {
  try {
    const { password } = req.body;
    const device = await Device.findOneAndUpdate(
      { deviceId: req.params.deviceId },
      { $set: { vpsPassword: (password || '').trim() } },
      { new: true }
    );
    if (!device) return res.status(404).json({ error: 'Device not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('[admin/devices/vps-password] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PATCH /api/admin/devices/:deviceId/scrape-config ── save pincode + jobs (legacy)
router.patch('/devices/:deviceId/scrape-config', adminAuth, async (req, res) => {
  try {
    const { pincode, jobs } = req.body;
    const update = {};
    if (pincode !== undefined) update.scrapePincode = String(pincode).trim();
    if (jobs !== undefined) update.scrapeJobs = Number(jobs) || 3;
    const device = await Device.findOneAndUpdate(
      { deviceId: req.params.deviceId },
      { $set: update },
      { new: true }
    );
    if (!device) return res.status(404).json({ error: 'Device not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('[admin/devices/scrape-config] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PATCH /api/admin/devices/:deviceId/scrape-tasks ── save multiple scrape tasks
router.patch('/devices/:deviceId/scrape-tasks', adminAuth, async (req, res) => {
  try {
    const { tasks } = req.body;
    if (!Array.isArray(tasks)) return res.status(400).json({ error: 'tasks array required' });

    // Validate and normalize each task
    const normalized = tasks
      .map((t) => {
        const startPin = String(t.startPin || '').trim();
        if (!startPin) return null;
        const type = t.type === 'range' || t.type === 'single' ? t.type : 'jobs';
        return {
          type,
          startPin,
          endPin: type === 'range' ? String(t.endPin || '').trim() : '',
          jobs: type === 'jobs' ? (Number(t.jobs) || 3) : 0,
        };
      })
      .filter(Boolean);

    const device = await Device.findOneAndUpdate(
      { deviceId: req.params.deviceId },
      { $set: { scrapeTasks: normalized } },
      { new: true }
    );
    if (!device) return res.status(404).json({ error: 'Device not found' });
    res.json({ success: true, tasks: device.scrapeTasks });
  } catch (err) {
    console.error('[admin/devices/scrape-tasks] Error:', err.message);
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
router.get('/jobs', adminAuth, async (req, res) => {
  try {
    const { deviceId, status, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (deviceId) filter.deviceId = deviceId;
    if (status) filter.status = status;

    const baseFilter = deviceId ? { deviceId } : {}; // for counts, ignore status filter

    const skip = (Number(page) - 1) * Number(limit);
    const [jobs, total, statusAgg] = await Promise.all([
      ScrapeTracking.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      ScrapeTracking.countDocuments(filter),
      // Always count all statuses (apply device filter but not status filter)
      ScrapeTracking.aggregate([
        { $match: baseFilter },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ]);

    const statusCounts = { running: 0, paused: 0, completed: 0, stopped: 0, stop: 0 };
    for (const s of statusAgg) {
      if (s._id in statusCounts) statusCounts[s._id] = s.count;
    }
    // Merge old 'stopped' into 'stop' for display
    statusCounts.stop += statusCounts.stopped;

    // Attach device names
    const deviceIds = [...new Set(jobs.map((j) => j.deviceId))];
    const deviceDocs = await Device.find({ deviceId: { $in: deviceIds } })
      .select('deviceId hostname nickname ip')
      .lean();
    const deviceMap = Object.fromEntries(
      deviceDocs.map((d) => [d.deviceId, d.nickname || d.ip || d.hostname])
    );
    const enriched = jobs.map((j) => ({
      ...j,
      deviceName: deviceMap[j.deviceId] || j.deviceId,
    }));

    res.json({ data: enriched, total, page: Number(page), limit: Number(limit), statusCounts });
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

// ── GET /api/admin/categories/:category/subcategories ──
// Aggregates scraped records by scrapSubCategory within a category
router.get('/categories/:category/subcategories', async (req, res) => {
  try {
    const { category } = req.params;

    const pipeline = [
      { $match: { category } },
      {
        $group: {
          _id: '$scrapSubCategory',
          count: { $sum: 1 },
          devices: { $addToSet: '$deviceId' },
          rounds: { $addToSet: '$scrapRound' },
        },
      },
      { $sort: { count: -1 } },
    ];

    const agg = await ScrapedData.aggregate(pipeline);
    const subCategories = agg.map((a) => ({
      subCategory: a._id || 'Uncategorized',
      count: a.count,
      devices: (a.devices || []).filter(Boolean).length,
      rounds: (a.rounds || []).filter((r) => r != null).sort(),
    }));

    const totalRecords = subCategories.reduce((sum, sc) => sum + sc.count, 0);
    res.json({ subCategories, totalRecords });
  } catch (err) {
    console.error('[admin/categories/:category/subcategories] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/admin/categories/:category/records ──
// Returns paginated scraped records for a specific category (optionally filtered by subCategory)
router.get('/categories/:category/records', async (req, res) => {
  try {
    const { category } = req.params;
    const { page = 1, limit = 25, subCategory } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const filter = { category };
    if (subCategory) filter.scrapSubCategory = subCategory;

    const [data, total] = await Promise.all([
      ScrapedData.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .select('name phone address rating reviews pincode plusCode website email photoUrl isDuplicate scrapedAt deviceId scrapSubCategory')
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

// ══════════════════════════════════════════════════════════════════════════════
// Page: Pincode Details (All)
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/admin/pincodes/coming-status ──
// Joins PinCode-Dataset with Pincode-Status; missing pincodes = "pending".
// Requires `state` query param (avoids loading entire 30k+ dataset at once).
router.get('/pincodes/coming-status', async (req, res) => {
  try {
    const { state, district, statusFilter, page: pageQ, limit: limitQ } = req.query;
    const page  = Math.max(1, parseInt(pageQ,  10) || 1);
    const limit = Math.min(1000, Math.max(1, parseInt(limitQ, 10) || 50));

    const statusFilters = statusFilter
      ? statusFilter.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    const pinFilter = {};
    if (state)    pinFilter.StateName = state;
    if (district) pinFilter.District  = district;

    const rawPincodes = await PinCode.find(
      pinFilter, { Pincode: 1, District: 1, StateName: 1, _id: 0 }
    ).sort({ Pincode: 1 }).lean();

    const seen = new Set();
    const uniquePincodes = [];
    for (const p of rawPincodes) {
      if (!seen.has(p.Pincode)) { seen.add(p.Pincode); uniquePincodes.push(p); }
    }

    const pincodeStrs = uniquePincodes.map(p => String(p.Pincode));
    const statusDocs  = await PincodeStatus.find(
      { pincode: { $in: pincodeStrs } },
      { pincode: 1, status: 1, completedRounds: 1, totalNiches: 1,
        completedSearches: 1, lastActivity: 1, lastRunAt: 1, updatedAt: 1 }
    ).lean();

    const statusMap = {};
    for (const s of statusDocs) statusMap[s.pincode] = s;

    let merged = uniquePincodes.map(p => {
      const st = statusMap[String(p.Pincode)];
      const completedRounds = st?.completedRounds || [];
      // Only truly "completed" if rounds 1, 2, 3 are ALL done
      let status = st?.status || 'pending';
      if (status === 'completed' && !(completedRounds.length >= 3 && [1,2,3].every(r => completedRounds.includes(r)))) {
        status = 'running';
      }
      return {
        pincode:           p.Pincode,
        district:          p.District  || null,
        stateName:         p.StateName || null,
        status,
        completedRounds,
        completedSearches: st?.completedSearches || 0,
        totalNiches:       st?.totalNiches       || 0,
        lastActivity:      st?.lastActivity      || null,
        lastRunAt:         st?.lastRunAt         || null,
        updatedAt:         st?.updatedAt         || null,
      };
    });

    if (statusFilters.length > 0) {
      merged = merged.filter(p => statusFilters.includes(p.status));
    }

    const counts = { running: 0, completed: 0, stop: 0, pending: 0 };
    for (const p of merged) counts[p.status] = (counts[p.status] || 0) + 1;

    const total    = merged.length;
    const pincodes = merged.slice((page - 1) * limit, page * limit);
    res.json({ pincodes, total, page, limit, counts });
  } catch (err) {
    console.error('[admin/pincodes/coming-status] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/admin/pincodes/filters ──
router.get('/pincodes/filters', async (req, res) => {
  try {
    const { state } = req.query;
    let districtFilter = {};
    if (state) {
      const arr = state.split(',').map((s) => s.trim()).filter(Boolean);
      districtFilter = { StateName: arr.length === 1 ? arr[0] : { $in: arr } };
    }
    const [states, districts] = await Promise.all([
      PinCode.distinct('StateName'),
      PinCode.distinct('District', districtFilter),
    ]);
    res.json({
      states: states.filter(Boolean).sort(),
      districts: districts.filter(Boolean).sort(),
    });
  } catch (err) {
    console.error('[admin/pincodes/filters] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/admin/pincodes ──
router.get('/pincodes', async (req, res) => {
  try {
    const { page = 1, limit = 50, search, state, district } = req.query;
    const filter = {};

    if (search) {
      const isNumeric = /^\d+$/.test(search);
      if (isNumeric) {
        filter.Pincode = Number(search);
      } else {
        filter.$or = [
          { District: { $regex: search, $options: 'i' } },
          { StateName: { $regex: search, $options: 'i' } },
          { CircleName: { $regex: search, $options: 'i' } },
        ];
      }
    }
    if (state) {
      const arr = state.split(',').map((s) => s.trim()).filter(Boolean);
      filter.StateName = arr.length === 1 ? arr[0] : { $in: arr };
    }
    if (district) {
      const arr = district.split(',').map((s) => s.trim()).filter(Boolean);
      filter.District = arr.length === 1 ? arr[0] : { $in: arr };
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
      PinCode.find(filter).sort({ Pincode: 1 }).skip(skip).limit(Number(limit)).lean(),
      PinCode.countDocuments(filter),
    ]);

    // Enrich with scraped data counts per pincode
    const pincodeValues = data.map((p) => String(p.Pincode));
    const scrapedCounts = await ScrapedData.aggregate([
      { $match: { pincode: { $in: pincodeValues } } },
      { $group: { _id: '$pincode', count: { $sum: 1 } } },
    ]);
    const countMap = {};
    for (const row of scrapedCounts) countMap[row._id] = row.count;

    const enriched = data.map((p) => ({
      ...p,
      scrapedCount: countMap[String(p.Pincode)] || 0,
    }));

    res.json({ data: enriched, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('[admin/pincodes] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// Page: Scraped Pincodes
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/admin/scraped-pincodes ──
router.get('/scraped-pincodes', async (req, res) => {
  try {
    const { page = 1, limit = 50, search, state, completionStatus } = req.query;

    const matchStage = {
      pincode: { $ne: null, $exists: true, $ne: '' },
    };

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: '$pincode',
          totalRecords: { $sum: 1 },
          categories: { $addToSet: '$scrapCategory' },
          subCategories: { $addToSet: '$scrapSubCategory' },
          rounds: { $addToSet: '$scrapRound' },
          devices: { $addToSet: '$deviceId' },
        },
      },
      { $sort: { totalRecords: -1 } },
    ];

    // Get total count
    const countResult = await ScrapedData.aggregate([...pipeline, { $count: 'total' }]);
    let totalAgg = countResult[0]?.total || 0;

    // Paginate
    const skip = (Number(page) - 1) * Number(limit);
    pipeline.push({ $skip: skip }, { $limit: Number(limit) });
    const aggregated = await ScrapedData.aggregate(pipeline);

    // Enrich with PinCode dataset info
    const pincodeValues = aggregated.map((a) => Number(a._id)).filter((n) => !isNaN(n));
    const pincodeDocs = await PinCode.find({ Pincode: { $in: pincodeValues } }).lean();
    const pincodeMap = {};
    for (const p of pincodeDocs) {
      if (!pincodeMap[p.Pincode]) pincodeMap[p.Pincode] = p;
    }

    // Enrich with completion status from Pincode-Status collection
    const pincodeStrings = aggregated.map((a) => String(a._id));
    const statusDocs = await PincodeStatus.find(
      { pincode: { $in: pincodeStrings } },
      { pincode: 1, status: 1, completedRounds: 1, totalRounds: 1 }
    ).lean();
    const statusMap = {};
    for (const s of statusDocs) statusMap[s.pincode] = s;

    let data = aggregated.map((a) => {
      const info = pincodeMap[Number(a._id)] || {};
      const statusDoc = statusMap[String(a._id)] || {};
      return {
        pincode: a._id,
        district: info.District || '—',
        stateName: info.StateName || '—',
        circleName: info.CircleName || '—',
        totalRecords: a.totalRecords,
        categories: (a.categories || []).filter(Boolean),
        subCategories: (a.subCategories || []).filter(Boolean),
        rounds: (a.rounds || []).filter((r) => r != null).sort(),
        devices: (a.devices || []).filter(Boolean),
        completionStatus: (statusDoc.status === 'completed' && !((statusDoc.completedRounds || []).length >= 3 && [1,2,3].every(r => (statusDoc.completedRounds || []).includes(r)))) ? 'running' : (statusDoc.status || 'running'),
        completedRounds: statusDoc.completedRounds || [],
      };
    });

    // Post-filter by state and search (text)
    if (state) {
      data = data.filter((d) => d.stateName === state);
      totalAgg = data.length;
    }
    if (search) {
      const s = search.toLowerCase();
      const isNumeric = /^\d+$/.test(search);
      if (isNumeric) {
        data = data.filter((d) => String(d.pincode).includes(search));
      } else {
        data = data.filter((d) =>
          d.district.toLowerCase().includes(s) || d.stateName.toLowerCase().includes(s)
        );
      }
      totalAgg = data.length;
    }
    if (completionStatus && completionStatus !== 'all') {
      data = data.filter((d) => d.completionStatus === completionStatus);
      totalAgg = data.length;
    }

    res.json({ data, total: totalAgg, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('[admin/scraped-pincodes] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// Page: Scrap Database
// ══════════════════════════════════════════════════════════════════════════════

function buildScrapDbFilter(params) {
  const {
    search, category, pincode, scrapCategory, scrapSubCategory,
    missingPhone, missingAddress, missingWebsite, missingEmail,
    hasPhone, hasAddress, hasWebsite, hasEmail,
    minRating, maxRating, minReviews, maxReviews,
    scrapWebsite, scrapFrom,
  } = params;
  const filter = {};

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { nameEnglish: { $regex: search, $options: 'i' } },
      { scrapKeyword: { $regex: search, $options: 'i' } },
      { address: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { website: { $regex: search, $options: 'i' } },
    ];
  }
  if (category) {
    const arr = category.split(',').map((s) => s.trim()).filter(Boolean);
    filter.category = arr.length === 1 ? arr[0] : { $in: arr };
  }
  if (scrapCategory) {
    const arr = scrapCategory.split(',').map((s) => s.trim()).filter(Boolean);
    filter.scrapCategory = arr.length === 1 ? arr[0] : { $in: arr };
  }
  if (scrapSubCategory) {
    const arr = scrapSubCategory.split(',').map((s) => s.trim()).filter(Boolean);
    filter.scrapSubCategory = arr.length === 1 ? arr[0] : { $in: arr };
  }
  if (pincode) {
    const arr = pincode.split(',').map((s) => s.trim()).filter(Boolean);
    filter.pincode = arr.length === 1 ? arr[0] : { $in: arr };
  }

  // Missing filters (field is null or empty)
  if (missingPhone === true || missingPhone === 'true') filter.phone = { $in: [null, ''] };
  if (missingAddress === true || missingAddress === 'true') filter.address = { $in: [null, ''] };
  if (missingWebsite === true || missingWebsite === 'true') filter.website = { $in: [null, ''] };
  if (missingEmail === true || missingEmail === 'true') filter.email = { $in: [null, ''] };

  // Available filters (field exists and is not empty)
  if (hasPhone === true || hasPhone === 'true') filter.phone = { $nin: [null, ''] };
  if (hasAddress === true || hasAddress === 'true') filter.address = { $nin: [null, ''] };
  if (hasWebsite === true || hasWebsite === 'true') filter.website = { $nin: [null, ''] };
  if (hasEmail === true || hasEmail === 'true') filter.email = { $nin: [null, ''] };

  // Rating filter
  if (minRating != null || maxRating != null) {
    filter.rating = {};
    if (minRating != null) filter.rating.$gte = Number(minRating);
    if (maxRating != null) filter.rating.$lte = Number(maxRating);
  }

  // Reviews count filter
  if (minReviews != null || maxReviews != null) {
    filter.reviews = {};
    if (minReviews != null) filter.reviews.$gte = Number(minReviews);
    if (maxReviews != null) filter.reviews.$lte = Number(maxReviews);
  }

  // scrapWebsite filter
  if (scrapWebsite === 'true' || scrapWebsite === true) filter.scrapWebsite = true;
  if (scrapWebsite === 'false' || scrapWebsite === false) filter.scrapWebsite = { $ne: true };

  // scrapFrom filter
  if (scrapFrom) filter.scrapFrom = scrapFrom;

  return filter;
}

// ── GET /api/admin/scrap-database/filters ──
router.get('/scrap-database/filters', async (req, res) => {
  try {
    const { scrapCategory } = req.query;
    const baseFilter = {};
    let subCatFilter;
    if (scrapCategory) {
      const arr = scrapCategory.split(',').map((s) => s.trim()).filter(Boolean);
      const catMatch = arr.length === 1 ? arr[0] : { $in: arr };
      subCatFilter = { ...baseFilter, scrapCategory: catMatch, scrapSubCategory: { $ne: null } };
    } else {
      subCatFilter = { ...baseFilter, scrapSubCategory: { $ne: null } };
    }
    const [categories, scrapCategories, scrapSubCategories, pincodes] = await Promise.all([
      ScrapedData.distinct('category', { ...baseFilter, category: { $ne: null } }),
      ScrapedData.distinct('scrapCategory', { ...baseFilter, scrapCategory: { $ne: null } }),
      ScrapedData.distinct('scrapSubCategory', subCatFilter),
      ScrapedData.distinct('pincode', { ...baseFilter, pincode: { $ne: null } }),
    ]);
    res.json({
      categories: categories.filter(Boolean).sort(),
      scrapCategories: scrapCategories.filter(Boolean).sort(),
      scrapSubCategories: scrapSubCategories.filter(Boolean).sort(),
      pincodes: pincodes.filter(Boolean).sort(),
    });
  } catch (err) {
    console.error('[admin/scrap-database/filters] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/admin/scrap-database/export ──
router.get('/scrap-database/export', async (req, res) => {
  try {
    const { ids, format = 'csv', ...filterParams } = req.query;

    let data;
    if (ids) {
      const idArr = ids.split(',');
      data = await ScrapedData.find({ _id: { $in: idArr } }).lean();
    } else {
      const filter = buildScrapDbFilter(filterParams);
      data = await ScrapedData.find(filter).sort({ createdAt: -1 }).limit(100000).lean();
    }

    const fields = [
      'name', 'address', 'phone', 'email', 'website', 'rating', 'reviews',
      'category', 'pincode', 'plusCode', 'photoUrl', 'latitude', 'longitude',
      'mapsUrl', 'scrapKeyword', 'scrapCategory', 'scrapSubCategory', 'scrapRound', 'scrapedAt',
    ];

    if (format === 'csv') {
      const header = fields.join(',');
      const rows = data.map((r) =>
        fields.map((f) => {
          const val = r[f] != null ? String(r[f]) : '';
          return val.includes(',') || val.includes('"') || val.includes('\n')
            ? `"${val.replace(/"/g, '""')}"` : val;
        }).join(',')
      );
      const csv = [header, ...rows].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=scraped-data.csv');
      return res.send(csv);
    }

    // JSON format for client-side Excel generation
    res.json({ data, fields });
  } catch (err) {
    console.error('[admin/scrap-database/export] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/admin/scrap-database ──
router.get('/scrap-database', async (req, res) => {
  try {
    const { page = 1, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', uniqueWebsite, ...filterParams } = req.query;
    const filter = buildScrapDbFilter(filterParams);

    const skip = (Number(page) - 1) * Number(limit);
    const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    let data, total;

    if (uniqueWebsite === 'true') {
      // Deduplicate by website URL — one record per unique website
      // For scrapWebsite filter: check if ANY record with that URL is scraped/not-scraped
      const baseFilter = { ...filter };
      const scrapWebsiteFilter = baseFilter.scrapWebsite;
      delete baseFilter.scrapWebsite; // remove from per-record filter

      const pipeline = [
        { $match: { ...baseFilter, website: { $nin: [null, ''] } } },
        { $sort: sort },
        {
          $group: {
            _id: '$website',
            doc: { $first: '$$ROOT' },
            hasScraped: { $max: { $cond: [{ $eq: ['$scrapWebsite', true] }, 1, 0] } },
          },
        },
      ];

      // Apply scrapWebsite filter AFTER grouping — per URL, not per record
      if (scrapWebsiteFilter === true) {
        // "scraped" = at least one record with this URL was scraped
        pipeline.push({ $match: { hasScraped: 1 } });
      } else if (scrapWebsiteFilter != null && scrapWebsiteFilter !== true) {
        // "not scraped" = NO record with this URL was scraped
        pipeline.push({ $match: { hasScraped: 0 } });
      }

      const [dataAgg, countAgg] = await Promise.all([
        ScrapedData.aggregate([
          ...pipeline,
          { $replaceRoot: { newRoot: '$doc' } },
          { $sort: sort },
          { $skip: skip },
          { $limit: Number(limit) },
        ]),
        ScrapedData.aggregate([
          ...pipeline,
          { $count: 'total' },
        ]),
      ]);
      data = dataAgg;
      total = countAgg[0]?.total || 0;
    } else {
      [data, total] = await Promise.all([
        ScrapedData.find(filter).sort(sort).skip(skip).limit(Number(limit)).lean(),
        ScrapedData.countDocuments(filter),
      ]);
    }

    res.json({ data, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('[admin/scrap-database] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PATCH /api/admin/scrap-database/soft-delete ──
// Hard deletes: moves records to Scraped-Data-Deleted, then removes from Scraped-Data.
router.patch('/scrap-database/soft-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array required' });
    }
    const BATCH = 500;
    const deletedAt = new Date();
    let deletedCount = 0;

    for (let i = 0; i < ids.length; i += BATCH) {
      const batchIds = ids.slice(i, i + BATCH);
      const records = await ScrapedData.find({ _id: { $in: batchIds } }).lean();
      if (records.length > 0) {
        const archivedDocs = records.map((r) => {
          const { _id, __v, isDeleted, ...rest } = r;
          return { ...rest, originalId: String(_id), deletedAt };
        });
        await ScrapedDataDeleted.insertMany(archivedDocs, { ordered: false });
        await ScrapedData.deleteMany({ _id: { $in: batchIds } });
        deletedCount += records.length;
      }
    }

    res.json({ success: true, deletedCount });
  } catch (err) {
    console.error('[admin/scrap-database/soft-delete] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PATCH /api/admin/scrap-database/soft-delete-filter ──
// Hard deletes: moves all records matching filter to Scraped-Data-Deleted.
router.patch('/scrap-database/soft-delete-filter', async (req, res) => {
  try {
    const filter = buildScrapDbFilter(req.body);
    const BATCH = 500;
    const deletedAt = new Date();
    let deletedCount = 0;

    while (true) {
      const records = await ScrapedData.find(filter).limit(BATCH).lean();
      if (records.length === 0) break;
      const batchIds = records.map((r) => r._id);
      const archivedDocs = records.map((r) => {
        const { _id, __v, isDeleted, ...rest } = r;
        return { ...rest, originalId: String(_id), deletedAt };
      });
      await ScrapedDataDeleted.insertMany(archivedDocs, { ordered: false });
      await ScrapedData.deleteMany({ _id: { $in: batchIds } });
      deletedCount += records.length;
    }

    res.json({ success: true, deletedCount });
  } catch (err) {
    console.error('[admin/scrap-database/soft-delete-filter] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PATCH /api/admin/scrap-database/mark-website-scraped ──
// Marks ALL records with the same website URL as scraped (not just the given ids)
router.patch('/scrap-database/mark-website-scraped', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array required' });
    }

    // Get website URLs for the given ids
    const docs = await ScrapedData.find({ _id: { $in: ids } }, { website: 1 }).lean();
    const urls = [...new Set(docs.map((d) => d.website).filter(Boolean))];

    let modifiedCount = 0;
    if (urls.length > 0) {
      // Mark ALL records with these website URLs as scraped
      const result = await ScrapedData.updateMany(
        { website: { $in: urls } },
        { $set: { scrapWebsite: true } }
      );
      modifiedCount = result.modifiedCount;
    } else {
      // Fallback: mark just the given ids
      const result = await ScrapedData.updateMany(
        { _id: { $in: ids } },
        { $set: { scrapWebsite: true } }
      );
      modifiedCount = result.modifiedCount;
    }

    res.json({ success: true, modifiedCount });
  } catch (err) {
    console.error('[admin/scrap-database/mark-website-scraped] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/admin/scrap-database/from-website ──
// Save new records (phones/emails) scraped from a website
router.post('/scrap-database/from-website', async (req, res) => {
  try {
    const { sourceId, records } = req.body;
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: 'records array required' });
    }

    // New records get scrapFrom + scrapWebsite flags so they don't appear in scraper queue
    const docs = records.map((r) => ({ ...r, scrapFrom: 'website', scrapWebsite: true }));
    const inserted = await ScrapedData.insertMany(docs, { ordered: false });

    // Mark ALL records with the same website URL as scraped
    if (sourceId) {
      const source = await ScrapedData.findById(sourceId, { website: 1 }).lean();
      if (source?.website) {
        await ScrapedData.updateMany(
          { website: source.website },
          { $set: { scrapWebsite: true } }
        );
      } else {
        await ScrapedData.updateOne({ _id: sourceId }, { $set: { scrapWebsite: true } });
      }
    }

    res.status(201).json({ success: true, count: inserted.length });
  } catch (err) {
    console.error('[admin/scrap-database/from-website] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// Page: Duplicates
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/admin/duplicates ──
// Returns paginated records with isDuplicate: true from Scraped-Data
router.get('/duplicates', async (req, res) => {
  try {
    const { page = 1, limit = 25, search } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const filter = { isDuplicate: true };
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { address: { $regex: search, $options: 'i' } },
        { website: { $regex: search, $options: 'i' } },
      ];
    }

    const [data, total] = await Promise.all([
      ScrapedData.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      ScrapedData.countDocuments(filter),
    ]);

    res.json({ data, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('[admin/duplicates] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/admin/duplicates/analyze ──
// Read-only: returns collection counts and flagged duplicate count.
// Does NOT move or modify any records.
router.post('/duplicates/analyze', async (req, res) => {
  try {
    const [flaggedCount, mainTotal, archiveTotal] = await Promise.all([
      ScrapedData.countDocuments({ isDuplicate: true }),
      ScrapedData.countDocuments({}),
      ScrapedDataDuplicate.countDocuments({}),
    ]);

    res.json({ success: true, flaggedCount, mainTotal, archiveTotal });
  } catch (err) {
    console.error('[admin/duplicates/analyze] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/admin/duplicates/delete-phone-name-address ──
// Step 1: Unset isDuplicate field from ALL records in Scraped-Data (permanently removed).
// Step 2: Finds records where phone + name + address all match (case-insensitive, trimmed).
//         Keeps the OLDEST record in Scraped-Data, moves 2nd+ duplicates to Scraped-Data-Duplicate.
// isDuplicate is NOT re-added after this operation.
router.post('/duplicates/delete-phone-name-address', async (req, res) => {
  try {
    // Step 1: Permanently remove isDuplicate field from all records
    await ScrapedData.updateMany({}, { $unset: { isDuplicate: '' } });

    const groups = await ScrapedData.aggregate([
      {
        $match: {
          phone:   { $nin: [null, ''] },
          name:    { $nin: [null, ''] },
          address: { $nin: [null, ''] },
        },
      },
      { $sort: { _id: 1 } }, // oldest first
      {
        $group: {
          _id: {
            phone:   { $toLower: { $trim: { input: '$phone' } } },
            name:    { $toLower: { $trim: { input: '$name' } } },
            address: { $toLower: { $trim: { input: '$address' } } },
          },
          docs: { $push: { id: '$_id', createdAt: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gte: 2 } } },
    ], { allowDiskUse: true });

    if (groups.length === 0) {
      return res.json({ success: true, movedCount: 0, groupCount: 0 });
    }

    const moveIds = [];

    for (const group of groups) {
      const sorted = group.docs.slice().sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
      for (let i = 1; i < sorted.length; i++) moveIds.push(sorted[i].id);
    }

    // Fetch full records in batches and archive to Scraped-Data-Duplicate
    const BATCH = 500;
    const now = new Date();
    let movedCount = 0;

    for (let i = 0; i < moveIds.length; i += BATCH) {
      const batchIds = moveIds.slice(i, i + BATCH);
      const recordsToMove = await ScrapedData.find({ _id: { $in: batchIds } }).lean();
      if (recordsToMove.length > 0) {
        const dupDocs = recordsToMove.map((r) => {
          const { _id, __v, ...rest } = r;
          return { ...rest, originalId: String(_id), movedAt: now };
        });
        await ScrapedDataDuplicate.insertMany(dupDocs, { ordered: false });
        const del = await ScrapedData.deleteMany({ _id: { $in: batchIds } });
        movedCount += del.deletedCount;
      }
    }

    res.json({ success: true, movedCount, groupCount: groups.length });
  } catch (err) {
    console.error('[admin/duplicates/delete-phone-name-address] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Helper: re-evaluate isDuplicate for all remaining records in Scraped-Data.
// Uses TWO compound keys:
//   1. Phone + Rating + Reviews + Category + PlusCode
//   2. Email + Rating + Reviews + Category + PlusCode
// Sets isDuplicate: true if another record shares either key, otherwise false.
async function recheckAllDuplicateFlags() {
  // Find duplicates by phone key
  const phoneDups = await ScrapedData.aggregate([
    { $match: { phone: { $nin: [null, ''] } } },
    {
      $group: {
        _id: { phone: '$phone', rating: '$rating', reviews: '$reviews', category: '$category', plusCode: '$plusCode' },
        ids: { $push: '$_id' },
        count: { $sum: 1 },
      },
    },
    { $match: { count: { $gte: 2 } } },
  ], { allowDiskUse: true });

  // Find duplicates by email key
  const emailDups = await ScrapedData.aggregate([
    { $match: { email: { $nin: [null, ''] } } },
    {
      $group: {
        _id: { email: '$email', rating: '$rating', reviews: '$reviews', category: '$category', plusCode: '$plusCode' },
        ids: { $push: '$_id' },
        count: { $sum: 1 },
      },
    },
    { $match: { count: { $gte: 2 } } },
  ], { allowDiskUse: true });

  const trueDupSet = new Set();
  for (const g of phoneDups) for (const id of g.ids) trueDupSet.add(String(id));
  for (const g of emailDups) for (const id of g.ids) trueDupSet.add(String(id));

  const allIds = (await ScrapedData.find({}, { _id: 1 }).lean()).map((r) => r._id);

  const shouldBeFalse = allIds.filter((id) => !trueDupSet.has(String(id)));
  const shouldBeTrue = [...trueDupSet].map((id) => id);

  const [falseResult, trueResult] = await Promise.all([
    shouldBeFalse.length > 0
      ? ScrapedData.updateMany(
          { _id: { $in: shouldBeFalse }, isDuplicate: { $ne: false } },
          { $set: { isDuplicate: false } }
        )
      : { modifiedCount: 0 },
    shouldBeTrue.length > 0
      ? ScrapedData.updateMany(
          { _id: { $in: shouldBeTrue }, isDuplicate: { $ne: true } },
          { $set: { isDuplicate: true } }
        )
      : { modifiedCount: 0 },
  ]);

  return falseResult.modifiedCount + trueResult.modifiedCount;
}

// ── GET /api/admin/duplicates/archive ──
// Returns paginated records from the Scraped-Data-Duplicate collection
router.get('/duplicates/archive', async (req, res) => {
  try {
    const { page = 1, limit = 25, search } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const filter = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { address: { $regex: search, $options: 'i' } },
        { website: { $regex: search, $options: 'i' } },
      ];
    }

    const [data, total] = await Promise.all([
      ScrapedDataDuplicate.find(filter).sort({ movedAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      ScrapedDataDuplicate.countDocuments(filter),
    ]);

    res.json({ data, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('[admin/duplicates/archive] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/admin/duplicates/restore-all ──
// Moves ALL records from Scraped-Data-Duplicate back to Scraped-Data.
// Strips only: _id, __v, movedAt, originalId — no extra flags added.
// Processes in batches of 500 to handle large archives.
router.post('/duplicates/restore-all', async (req, res) => {
  try {
    const BATCH = 500;
    let restoredCount = 0;

    while (true) {
      const batch = await ScrapedDataDuplicate.find({}).limit(BATCH).lean();
      if (batch.length === 0) break;

      const batchIds = batch.map((r) => r._id);
      const cleanDocs = batch.map((r) => {
        const { _id, __v, movedAt, originalId, ...rest } = r;
        return rest;
      });

      await ScrapedData.insertMany(cleanDocs, { ordered: false });
      await ScrapedDataDuplicate.deleteMany({ _id: { $in: batchIds } });
      restoredCount += batch.length;
    }

    res.json({ success: true, restoredCount });
  } catch (err) {
    console.error('[admin/duplicates/restore-all] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/admin/sessions/:sessionId/records ──
router.get('/sessions/:sessionId/records', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { page = 1, limit = 100 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
      ScrapedData.find({ sessionId }).sort({ createdAt: 1 }).skip(skip).limit(Number(limit)).lean(),
      ScrapedData.countDocuments({ sessionId }),
    ]);
    res.json({ data, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('[admin/sessions/:sessionId/records] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/admin/cron/run/:name ──
router.post('/cron/run/:name', adminAuth, async (req, res) => {
  const { name } = req.params;
  try {
    const { runOfflineCheck } = require('../services/deviceCron');
    const { runPincodeCompletionCheck, runPincodeStopCheck } = require('../services/pincodeCron');
    const { runScrapeJobCheck } = require('../services/scrapeJobCron');

    let result;
    if (name === 'device-offline') {
      result = await runOfflineCheck();
      return res.json({ ok: true, cron: name, result: result || {} });
    } else if (name === 'pincode-completion') {
      result = await runPincodeCompletionCheck();
      return res.json({ ok: true, cron: name, result });
    } else if (name === 'pincode-stop') {
      result = await runPincodeStopCheck();
      return res.json({ ok: true, cron: name, result });
    } else if (name === 'scrape-job-status') {
      result = await runScrapeJobCheck();
      return res.json({ ok: true, cron: name, result });
    } else {
      return res.status(404).json({ error: `Unknown cron: ${name}` });
    }
  } catch (err) {
    console.error(`[admin/cron/run/${name}] Error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/admin/search-status/dedup ── remove duplicate Search-Status entries
// Keeps the first (oldest) entry per (category, subCategory, pincode), merges rounds, deletes the rest
router.delete('/search-status/dedup', adminAuth, async (req, res) => {
  try {
    const startTime = Date.now();
    console.log('[search-status/dedup] Starting — fetching duplicate groups via cursor (100 at a time)...');

    // Group by (category, subCategory, pincode) — new schema has no round field
    const cursor = SearchStatus.aggregate([
      {
        $group: {
          _id: { category: '$category', subCategory: '$subCategory', pincode: '$pincode' },
          keepId: { $min: '$_id' },
          allRounds: { $push: '$rounds' },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ]).allowDiskUse(true).option({ maxTimeMS: 300000 }).cursor({ batchSize: 100 });

    let groupsAffected = 0;
    let deletedCount = 0;
    let batch = [];

    async function processBatch(groups) {
      for (const g of groups) {
        // Merge all rounds arrays into the kept doc
        const mergedRounds = [...new Set(g.allRounds.flat())].sort((a, b) => a - b);
        await SearchStatus.updateOne(
          { _id: g.keepId },
          { $set: { rounds: mergedRounds } }
        );
        // Delete all other docs in this group
        const result = await SearchStatus.deleteMany({
          category: g._id.category,
          subCategory: g._id.subCategory,
          pincode: g._id.pincode,
          _id: { $ne: g.keepId },
        });
        deletedCount += result.deletedCount;
      }
    }

    for await (const group of cursor) {
      batch.push(group);
      groupsAffected++;

      if (batch.length >= 100) {
        await processBatch(batch);
        console.log(`[search-status/dedup] Processed ${groupsAffected} groups — deleted ${deletedCount} so far`);
        batch = [];
      }
    }

    if (batch.length > 0) {
      await processBatch(batch);
      console.log(`[search-status/dedup] Processed ${groupsAffected} groups — deleted ${deletedCount} so far`);
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

    if (deletedCount === 0) {
      console.log(`[search-status/dedup] No duplicates found (${totalTime}s)`);
      return res.json({ message: 'No duplicates found', deletedCount: 0, groupsAffected: 0 });
    }

    console.log(`[search-status/dedup] Done. Deleted ${deletedCount} duplicates across ${groupsAffected} groups in ${totalTime}s`);
    res.json({
      message: `Deleted ${deletedCount} duplicate Search-Status entries`,
      deletedCount,
      groupsAffected,
    });
  } catch (err) {
    console.error('[search-status/dedup] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
