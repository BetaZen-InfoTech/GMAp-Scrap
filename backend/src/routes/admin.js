const express = require('express');
const router = express.Router();
const { adminAuth, validTokens, ADMIN_PASSWORD, generateToken } = require('../middleware/adminAuth');

const Device = require('../models/Device');
const DeviceHistory = require('../models/DeviceHistory');
const SessionStats = require('../models/SessionStats');
const ScrapeTracking = require('../models/ScrapeTracking');
const ScrapedData = require('../models/ScrapedData');
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

// ── GET /api/admin/categories/:category/subcategories ──
// Aggregates scraped records by scrapSubCategory within a category
router.get('/categories/:category/subcategories', async (req, res) => {
  try {
    const { category } = req.params;

    const pipeline = [
      { $match: { category, isDeleted: { $ne: true } } },
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

    const filter = { category, isDeleted: { $ne: true } };
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
      { $match: { pincode: { $in: pincodeValues }, isDeleted: { $ne: true } } },
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
    const { page = 1, limit = 50, search, state } = req.query;

    const matchStage = {
      pincode: { $ne: null, $exists: true, $ne: '' },
      isDeleted: { $ne: true },
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

    let data = aggregated.map((a) => {
      const info = pincodeMap[Number(a._id)] || {};
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
  } = params;
  const filter = { isDeleted: { $ne: true } };

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { nameEnglish: { $regex: search, $options: 'i' } },
      { scrapKeyword: { $regex: search, $options: 'i' } },
      { address: { $regex: search, $options: 'i' } },
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

  return filter;
}

// ── GET /api/admin/scrap-database/filters ──
router.get('/scrap-database/filters', async (req, res) => {
  try {
    const { scrapCategory } = req.query;
    const baseFilter = { isDeleted: { $ne: true } };
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
    const { page = 1, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', ...filterParams } = req.query;
    const filter = buildScrapDbFilter(filterParams);

    const skip = (Number(page) - 1) * Number(limit);
    const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const [data, total] = await Promise.all([
      ScrapedData.find(filter).sort(sort).skip(skip).limit(Number(limit)).lean(),
      ScrapedData.countDocuments(filter),
    ]);

    res.json({ data, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('[admin/scrap-database] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PATCH /api/admin/scrap-database/soft-delete ──
router.patch('/scrap-database/soft-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array required' });
    }
    const result = await ScrapedData.updateMany(
      { _id: { $in: ids } },
      { $set: { isDeleted: true } }
    );
    res.json({ success: true, modifiedCount: result.modifiedCount });
  } catch (err) {
    console.error('[admin/scrap-database/soft-delete] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PATCH /api/admin/scrap-database/soft-delete-filter ──
router.patch('/scrap-database/soft-delete-filter', async (req, res) => {
  try {
    const filter = buildScrapDbFilter(req.body);
    const result = await ScrapedData.updateMany(filter, { $set: { isDeleted: true } });
    res.json({ success: true, modifiedCount: result.modifiedCount });
  } catch (err) {
    console.error('[admin/scrap-database/soft-delete-filter] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
