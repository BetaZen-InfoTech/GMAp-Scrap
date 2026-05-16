const express = require('express');
const router = express.Router();
const ScrapedData = require('../models/ScrapedData');
const SessionStats = require('../models/SessionStats');
const Device = require('../models/Device');
const { fixPhoneNumber } = require('../utils/phoneFixer');

/** Fire-and-forget: mark device as online + update lastSeenAt + update IP */
function touchDevice(deviceId, ip) {
  if (!deviceId) return;
  const update = { lastSeenAt: new Date(), status: 'online' };
  if (ip) update.ip = ip;
  Device.updateOne({ deviceId }, { $set: update }).catch((err) => {
    console.error(`[touchDevice] Failed to touch ${deviceId}:`, err.message);
  });
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || req.ip || '';
}

/**
 * Build duplicate keys from 5 fields.
 * Key 1: Phone + Rating + Reviews + Category + PlusCode
 * Key 2: Email + Rating + Reviews + Category + PlusCode
 * Returns array of keys (1 or 2 depending on available fields)
 */
function dupKeys(phone, email, rating, reviews, category, plusCode) {
  const keys = [];
  if (phone) keys.push(`P|${phone}|${rating || 0}|${reviews || 0}|${category || ''}|${plusCode || ''}`);
  if (email) keys.push(`E|${email}|${rating || 0}|${reviews || 0}|${category || ''}|${plusCode || ''}`);
  return keys;
}

/**
 * Extract a 6-digit Indian pincode from an address string.
 * Returns the first match or null.
 */
function extractPincode(address) {
  if (!address) return null;
  const match = address.match(/\b(\d{6})\b/);
  return match ? match[1] : null;
}

/**
 * Shared dedup helper used by both /batch and /from-website.
 *
 * Given an array of incoming records (each carrying phone/email/rating/reviews/
 * category/plusCode at minimum), returns:
 *   { newDocs, dupDocs, existingKeys }
 *
 * where every record is marked `isDuplicate: true|false` based on whether any
 * of its (Phone|Email)+R+R+C+PC keys already exist in the DB OR earlier in
 * the same incoming batch.
 *
 * The caller is responsible for inserting both arrays — both `/batch` and
 * `/from-website` save duplicates too (with the flag) so the operator can
 * see what was rejected by dedup.
 */
async function classifyDuplicates(records) {
  // Build the $or filter from every record's phone/email so we can fetch
  // existing-key candidates in one round trip.
  const phoneConditions = [];
  const emailConditions = [];
  for (const r of records) {
    if (r.phone) phoneConditions.push({ phone: r.phone, rating: r.rating || 0, reviews: r.reviews || 0, category: r.category || null, plusCode: r.plusCode || null });
    if (r.email) emailConditions.push({ email: r.email, rating: r.rating || 0, reviews: r.reviews || 0, category: r.category || null, plusCode: r.plusCode || null });
  }
  const orConditions = [...phoneConditions, ...emailConditions];

  const existing = orConditions.length > 0
    ? await ScrapedData.find(
        { $or: orConditions },
        { phone: 1, email: 1, rating: 1, reviews: 1, category: 1, plusCode: 1 }
      ).lean()
    : [];

  const existingKeys = new Set();
  for (const e of existing) {
    for (const k of dupKeys(e.phone, e.email, e.rating, e.reviews, e.category, e.plusCode)) {
      existingKeys.add(k);
    }
  }

  const tagged = records.map((r) => {
    const keys = dupKeys(r.phone, r.email, r.rating || 0, r.reviews || 0, r.category, r.plusCode);
    const isDup = keys.some((k) => existingKeys.has(k));
    if (!isDup) {
      // Within-batch dedup: a later record with the same key gets flagged
      for (const k of keys) existingKeys.add(k);
    }
    return { record: r, isDup };
  });

  return { tagged, existingKeys };
}

// POST /api/scraped-data/batch — receive batch of scraped records, deduplicate, and save to DB
router.post('/batch', async (req, res) => {
  try {
    const { batchNumber, deviceId, sessionId, records, timestamp, pincode: batchPincode, keyword: batchKeyword, scrapCategory: batchScrapCategory, scrapSubCategory: batchScrapSubCategory, round: batchRound } = req.body;

    if (!records || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: 'records array is required and must not be empty' });
    }

    touchDevice(deviceId, getClientIp(req));

    // ── Phone normalization ──
    // Normalize each record's phone in-place so duplicate detection and storage
    // both use the same canonical value. `_numberFixing` is carried per-record
    // so we can persist the flag when we build the doc below.
    for (const r of records) {
      const { phone: fixedPhone, fixed } = fixPhoneNumber(r.phone);
      r.phone = fixedPhone;
      r._numberFixing = fixed;
    }

    // ── Duplicate detection (Phone+R+R+C+PC AND Email+R+R+C+PC) ──
    const { tagged } = await classifyDuplicates(records);

    // Split records into new and duplicates — both are saved, duplicates flagged
    const newDocs = [];
    const dupDocs = [];

    for (const { record: r, isDup } of tagged) {
      // Resolve pincode: record-level → batch-level → extract from address
      const resolvedPincode = r.pincode || batchPincode || extractPincode(r.address) || undefined;

      const doc = {
        sessionId: r.sessionId || sessionId,
        deviceId: deviceId || undefined,
        batchNumber: batchNumber || 0,
        name: r.name,
        nameEnglish: r.nameEnglish,
        nameLocal: r.nameLocal,
        address: r.address,
        phone: r.phone,
        email: r.email,
        website: r.website,
        rating: r.rating || 0,
        reviews: r.reviews || 0,
        category: r.category,
        pincode: resolvedPincode,
        plusCode: r.plusCode,
        photoUrl: r.photoUrl,
        latitude: r.latitude,
        longitude: r.longitude,
        mapsUrl: r.mapsUrl,
        scrapKeyword: batchKeyword || undefined,
        scrapCategory: r.scrapCategory || batchScrapCategory || undefined,
        scrapSubCategory: r.scrapSubCategory || batchScrapSubCategory || undefined,
        scrapRound: batchRound || undefined,
        scrapedAt: r.timestamp || timestamp,
        scrapFrom: 'G-Map',
        numberFixing: r._numberFixing === true,
        isDuplicate: isDup,
      };

      if (isDup) dupDocs.push(doc);
      else       newDocs.push(doc);
    }

    // Insert all records (new + duplicates)
    const insertedIds = [];
    const duplicateIds = [];
    const allDocs = [...newDocs, ...dupDocs];

    if (allDocs.length > 0) {
      const inserted = await ScrapedData.insertMany(allDocs, { ordered: false });
      for (const d of inserted) {
        if (d.isDuplicate) {
          duplicateIds.push(d._id);
        } else {
          insertedIds.push(d._id);
        }
      }
    }

    res.status(201).json({
      success: true,
      count: newDocs.length,
      duplicateCount: dupDocs.length,
      totalReceived: records.length,
      batchNumber,
      insertedIds,
      duplicateIds,
    });
  } catch (err) {
    console.error('[scraped-data/batch POST] Error:', err.message);
    res.status(500).json({ error: 'Server error', message: err.message });
  }
});

// POST /api/scraped-data/session-stats — save or update session statistics
// Single doc per (pincode, category, subCategory) — rounds tracked as array
// Stats are accumulated ($inc) across rounds
router.post('/session-stats', async (req, res) => {
  try {
    const { pincode, category, subCategory, round } = req.body;

    if (pincode == null || !category || !subCategory) {
      return res.status(400).json({ error: 'pincode, category, subCategory are required' });
    }

    touchDevice(req.body.deviceId, getClientIp(req));

    const $set = {};
    const setFields = [
      'sessionId', 'jobId', 'deviceId', 'keyword',
      'pincode', 'district', 'stateName',
      'category', 'subCategory',
      'status',
      'startedAt', 'completedAt', 'durationMs',
    ];
    for (const key of setFields) {
      if (req.body[key] !== undefined) {
        $set[key] = req.body[key];
      }
    }

    const $inc = {};
    const incFields = ['totalRecords', 'insertedRecords', 'duplicateRecords', 'batchesSent'];
    for (const key of incFields) {
      if (req.body[key] !== undefined && req.body[key] > 0) {
        $inc[key] = req.body[key];
      }
    }

    const update = { $set };
    if (Object.keys($inc).length > 0) update.$inc = $inc;
    if (round != null) update.$addToSet = { rounds: round };

    const doc = await SessionStats.findOneAndUpdate(
      { pincode, category, subCategory },
      update,
      { upsert: true, new: true }
    );

    res.status(201).json({ success: true, id: doc._id });
  } catch (err) {
    console.error('[scraped-data/session-stats POST] Error:', err.message);
    res.status(500).json({ error: 'Server error', message: err.message });
  }
});

// GET /api/scraped-data/session-stats/check-completed — check if a search is already completed
// Query params: pincode, category, subCategory (required), round (optional)
router.get('/session-stats/check-completed', async (req, res) => {
  try {
    const { pincode, category, subCategory, round, keyword } = req.query;

    let filter;
    if (pincode && category && subCategory) {
      filter = { pincode: Number(pincode), category: String(category), subCategory: String(subCategory), status: 'completed' };
      if (round != null) filter.rounds = Number(round);
    } else if (keyword) {
      // Fallback for legacy callers
      filter = { keyword: String(keyword), status: 'completed' };
      if (round != null) filter.rounds = Number(round);
    } else {
      return res.status(400).json({ error: 'pincode+category+subCategory or keyword is required' });
    }

    const doc = await SessionStats.findOne(filter).lean();
    res.json({ completed: !!doc });
  } catch (err) {
    console.error('[session-stats/check-completed GET] Error:', err.message);
    res.status(500).json({ error: 'Server error', message: err.message });
  }
});

// GET /api/scraped-data/session-stats/completed/:jobId — get completed searches from Session-Stats for a job
router.get('/session-stats/completed/:jobId', async (req, res) => {
  try {
    const stats = await SessionStats.find(
      { jobId: req.params.jobId, status: 'completed' },
      { pincode: 1, category: 1, subCategory: 1, rounds: 1, keyword: 1 }
    ).lean();
    res.json(stats);
  } catch (err) {
    console.error('[scraped-data/session-stats/completed GET] Error:', err.message);
    res.status(500).json({ error: 'Server error', message: err.message });
  }
});

// GET /api/scraped-data/session-stats/:jobId — get all session stats for a job
router.get('/session-stats/:jobId', async (req, res) => {
  try {
    const stats = await SessionStats.find({ jobId: req.params.jobId })
      .sort({ createdAt: -1 })
      .lean();
    res.json(stats);
  } catch (err) {
    console.error('[scraped-data/session-stats GET] Error:', err.message);
    res.status(500).json({ error: 'Server error', message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Website-scraper CLI endpoints
//
// Public (non-admin) endpoints that mirror the existing admin browser flow at
// /api/admin/scrap-database/{from-website,mark-website-scraped}. Used by the
// CLI's WEB mode so each scraper device doesn't need to open its own mongoose
// connection pool (the v1.6.0 DB-direct architecture was retired here because
// 35+ devices × 5-10 pool slots was hammering the Mongo CPU).
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/scraped-data/website-pool?from=X&to=Y
// Returns the slice [from..to) of the unscraped-website pool (G-Map records
// with a website that haven't been processed yet). All N CLI workers running
// the same task hit this with the same from/to and slice their chunk locally.
router.get('/website-pool', async (req, res) => {
  try {
    const from = Math.max(0, parseInt(req.query.from, 10) || 0);
    const to   = parseInt(req.query.to,   10);
    if (!Number.isInteger(to) || to <= from) {
      return res.status(400).json({ error: 'to must be an integer > from' });
    }
    // Cap the per-request size so a typo (from=0 to=10000000) doesn't pull
    // millions of rows through the API server. 25k is comfortably above the
    // 100/500 typical operator pick but small enough to stream over HTTP.
    const limit = Math.min(25000, to - from);

    const sites = await ScrapedData.find(
      {
        scrapFrom: 'G-Map',
        website: { $nin: [null, ''] },
        scrapWebsite: { $ne: true },
      },
      {
        _id: 1, name: 1, address: 1, pincode: 1, plusCode: 1, latitude: 1, longitude: 1,
        category: 1, website: 1, scrapKeyword: 1, scrapCategory: 1, scrapSubCategory: 1,
      }
    )
      .sort({ _id: 1 })
      .skip(from)
      .limit(limit)
      .lean();

    res.json({ sites, from, to, returned: sites.length });
  } catch (err) {
    console.error('[scraped-data/website-pool GET] Error:', err.message);
    res.status(500).json({ error: 'Server error', message: err.message });
  }
});

// POST /api/scraped-data/from-website
// CLI sends N harvested (phone/email/contactName) rows for one source website.
// Records are tagged scrapFrom='website' + scrapWebsite=true so the admin's
// website-scraper queue knows not to revisit them.
//
// Body: { sourceId, records: [...], deviceId? }
//
// Dedup: runs the same Phone+R+R+C+PC / Email+R+R+C+PC classifier as /batch.
// Two workers scraping the same backlog slice (or fan-out of the same email
// across multiple phones from one site) used to write duplicate rows here;
// they're now flagged with isDuplicate=true so the admin can filter them out.
router.post('/from-website', async (req, res) => {
  try {
    const { sourceId, records, deviceId } = req.body;
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: 'records array required' });
    }

    touchDevice(deviceId, getClientIp(req));

    // Normalize phones up front so dedup keys and storage both use the same
    // canonical value. Stamp the `_numberFixing` flag per-record so we can
    // persist it when building the final doc.
    for (const r of records) {
      const { phone: fixedPhone, fixed } = fixPhoneNumber(r.phone);
      r.phone = fixedPhone;
      r._numberFixing = fixed;
    }

    const { tagged } = await classifyDuplicates(records);

    const newDocs = [];
    const dupDocs = [];
    for (const { record: r, isDup } of tagged) {
      const doc = {
        sessionId: r.sessionId,
        deviceId: deviceId || r.deviceId,
        name: r.name,
        nameEnglish: r.nameEnglish,
        nameLocal: r.nameLocal,
        address: r.address,
        phone: r.phone,
        email: r.email,
        website: r.website,
        rating: r.rating || 0,
        reviews: r.reviews || 0,
        category: r.category,
        pincode: r.pincode,
        plusCode: r.plusCode,
        photoUrl: r.photoUrl,
        latitude: r.latitude,
        longitude: r.longitude,
        mapsUrl: r.mapsUrl,
        scrapKeyword: r.scrapKeyword,
        scrapCategory: r.scrapCategory,
        scrapSubCategory: r.scrapSubCategory,
        scrapRound: r.scrapRound,
        scrapedAt: r.scrapedAt || new Date().toISOString(),
        scrapFrom: 'website',
        scrapWebsite: true,
        numberFixing: r._numberFixing === true,
        isDuplicate: isDup,
      };
      if (isDup) dupDocs.push(doc);
      else       newDocs.push(doc);
    }

    const insertedIds = [];
    const duplicateIds = [];
    const allDocs = [...newDocs, ...dupDocs];
    if (allDocs.length > 0) {
      try {
        const inserted = await ScrapedData.insertMany(allDocs, { ordered: false });
        for (const d of inserted) {
          if (d.isDuplicate) duplicateIds.push(d._id);
          else               insertedIds.push(d._id);
        }
      } catch (err) {
        // Partial success on unique-index collisions — keep what landed.
        for (const d of (err.insertedDocs || [])) {
          if (d.isDuplicate) duplicateIds.push(d._id);
          else               insertedIds.push(d._id);
        }
      }
    }

    // Mark every record carrying this URL as scraped so the queue stops
    // surfacing them. Fire-and-forget shape: a bad sourceId shouldn't fail
    // the write that already succeeded.
    if (sourceId) {
      try {
        const source = await ScrapedData.findById(sourceId, { website: 1 }).lean();
        if (source?.website) {
          await ScrapedData.updateMany(
            { website: source.website },
            { $set: { scrapWebsite: true } }
          );
        } else {
          await ScrapedData.updateOne({ _id: sourceId }, { $set: { scrapWebsite: true } });
        }
      } catch (_) { /* non-fatal */ }
    }

    res.status(201).json({
      success: true,
      count: newDocs.length,
      duplicateCount: dupDocs.length,
      totalReceived: records.length,
      insertedIds,
      duplicateIds,
    });
  } catch (err) {
    console.error('[scraped-data/from-website POST] Error:', err.message);
    res.status(500).json({ error: 'Server error', message: err.message });
  }
});

// PATCH /api/scraped-data/mark-website-scraped
// CLI calls this when a site yields no contacts — so the next worker pass
// doesn't keep revisiting dead URLs.
//
// Body: { ids: [...] }  (Scraped-Data _ids, NOT websites)
router.patch('/mark-website-scraped', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array required' });
    }
    // Mark every record sharing a URL with any of the ids — same semantics as
    // /from-website above so the queue stays consistent.
    const docs = await ScrapedData.find({ _id: { $in: ids } }, { website: 1 }).lean();
    const urls = [...new Set(docs.map((d) => d.website).filter(Boolean))];

    let modified = 0;
    if (urls.length > 0) {
      const r = await ScrapedData.updateMany(
        { website: { $in: urls } },
        { $set: { scrapWebsite: true } }
      );
      modified = r.modifiedCount;
    } else {
      const r = await ScrapedData.updateMany(
        { _id: { $in: ids } },
        { $set: { scrapWebsite: true } }
      );
      modified = r.modifiedCount;
    }
    res.json({ success: true, modified });
  } catch (err) {
    console.error('[scraped-data/mark-website-scraped PATCH] Error:', err.message);
    res.status(500).json({ error: 'Server error', message: err.message });
  }
});

module.exports = router;
