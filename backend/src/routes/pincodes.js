const express = require('express');
const router = express.Router();
const PinCode = require('../models/PinCode');
const PincodeStatus = require('../models/PincodeStatus');

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

// GET /api/pincodes/states — list all unique states
router.get('/states', async (req, res) => {
  try {
    const states = await PinCode.aggregate([
      { $match: { StateName: { $exists: true, $ne: null } } },
      { $group: { _id: '$StateName' } },
      { $sort: { _id: 1 } },
    ]);
    res.json(states.map(s => s._id).filter(Boolean));
  } catch (err) {
    console.error('[pincodes/states] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/pincodes/districts?state=X — list districts for a state
router.get('/districts', async (req, res) => {
  try {
    const filter = { District: { $exists: true, $ne: null } };
    if (req.query.state) filter.StateName = req.query.state;

    const districts = await PinCode.aggregate([
      { $match: filter },
      { $group: { _id: '$District' } },
      { $sort: { _id: 1 } },
    ]);
    res.json(districts.map(d => d._id).filter(Boolean));
  } catch (err) {
    console.error('[pincodes/districts] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/pincodes/status
//   ?state=West+Bengal
//   &district=Kolkata
//   &statusFilter=running,completed,stop,pending   (comma-separated, empty = all)
//   &page=1  &limit=50
//
// Joins PinCode-Dataset (master list) with Pincode-Status collection.
// Pincodes not yet in Pincode-Status are returned with status = "pending".
router.get('/status', async (req, res) => {
  try {
    const { state, district, statusFilter, page: pageQ, limit: limitQ } = req.query;
    const page  = Math.max(1, parseInt(pageQ,  10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(limitQ, 10) || 50));

    const statusFilters = statusFilter
      ? statusFilter.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    // ── 1. Fetch unique pincodes from PinCode-Dataset filtered by state/district ──
    const pinFilter = {};
    if (state)    pinFilter.StateName = state;
    if (district) pinFilter.District  = district;

    const rawPincodes = await PinCode.find(
      pinFilter,
      { Pincode: 1, District: 1, StateName: 1, _id: 0 }
    ).sort({ Pincode: 1 }).lean();

    // Deduplicate by Pincode value
    const seen = new Set();
    const uniquePincodes = [];
    for (const p of rawPincodes) {
      if (!seen.has(p.Pincode)) {
        seen.add(p.Pincode);
        uniquePincodes.push(p);
      }
    }

    // ── 2. Batch-lookup Pincode-Status for these pincodes ──
    const pincodeStrs = uniquePincodes.map(p => String(p.Pincode));
    const statusDocs  = await PincodeStatus.find(
      { pincode: { $in: pincodeStrs } },
      { pincode: 1, status: 1, completedRounds: 1, totalNiches: 1,
        completedSearches: 1, lastActivity: 1, lastRunAt: 1, updatedAt: 1 }
    ).lean();

    const statusMap = {};
    for (const s of statusDocs) statusMap[s.pincode] = s;

    // ── 3. Merge: pincodes not in Pincode-Status → "pending" ──
    let merged = uniquePincodes.map(p => {
      const st = statusMap[String(p.Pincode)];
      return {
        pincode:           p.Pincode,
        district:          p.District   || null,
        stateName:         p.StateName  || null,
        status:            st?.status   || 'pending',
        completedRounds:   st?.completedRounds   || [],
        completedSearches: st?.completedSearches || 0,
        totalNiches:       st?.totalNiches       || 0,
        lastActivity:      st?.lastActivity      || null,
        lastRunAt:         st?.lastRunAt         || null,
        updatedAt:         st?.updatedAt         || null,
      };
    });

    // ── 4. Filter by requested statuses ──
    if (statusFilters.length > 0) {
      merged = merged.filter(p => statusFilters.includes(p.status));
    }

    // ── 5. Summary counts (across full filtered set, before pagination) ──
    const counts = { running: 0, completed: 0, stop: 0, pending: 0 };
    for (const p of merged) {
      counts[p.status] = (counts[p.status] || 0) + 1;
    }

    // ── 6. Paginate ──
    const total    = merged.length;
    const pincodes = merged.slice((page - 1) * limit, page * limit);

    res.json({ pincodes, total, page, limit, counts });
  } catch (err) {
    console.error('[pincodes/status] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
