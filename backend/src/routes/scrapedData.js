const express = require('express');
const router = express.Router();
const ScrapedData = require('../models/ScrapedData');
const WebsiteAnalysis = require('../models/WebsiteAnalysis');
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
 * Extract a 6-digit Indian pincode from an address string.
 * Returns the first match or null.
 */
function extractPincode(address) {
  if (!address) return null;
  const match = address.match(/\b(\d{6})\b/);
  return match ? match[1] : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// v1.8.8 — Duplicate detection no longer runs on the write path.
//
// Until v1.8.7 every /batch and /from-website call ran a $or query against
// Scraped-Data with up to 100 (phone+rating+reviews+category+plusCode)
// conditions to flag duplicates inline. With 35+ G-Map devices and 7+
// website-scraper workers all hitting the API in parallel, those queries
// were a dominant source of MongoDB CPU load — and they all hit the same
// duplicate_check_idx, so they serialized on the cache.
//
// Duplicate flagging is now handled POST-HOC by the admin "Analyze
// Duplicates" action (see backend/src/routes/admin.js — re-evaluates
// isDuplicate across the whole collection and moves the matches to the
// Scraped-Data-Duplicate archive). All rows from the write path land here
// flat with isDuplicate: false (the schema default).
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/scraped-data/batch — receive batch of scraped records, save to DB
router.post('/batch', async (req, res) => {
  try {
    const { batchNumber, deviceId, sessionId, records, timestamp, pincode: batchPincode, keyword: batchKeyword, scrapCategory: batchScrapCategory, scrapSubCategory: batchScrapSubCategory, round: batchRound } = req.body;

    if (!records || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: 'records array is required and must not be empty' });
    }

    touchDevice(deviceId, getClientIp(req));

    // ── Phone normalization ──
    // Normalize each record's phone in-place so storage uses the canonical
    // value. CPU-only transform, no DB roundtrip.
    for (const r of records) {
      const { phone: fixedPhone, fixed } = fixPhoneNumber(r.phone);
      r.phone = fixedPhone;
      r._numberFixing = fixed;
    }

    const docs = records.map((r) => {
      // Resolve pincode: record-level → batch-level → extract from address
      const resolvedPincode = r.pincode || batchPincode || extractPincode(r.address) || undefined;
      return {
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
      };
    });

    const insertedIds = [];
    if (docs.length > 0) {
      const inserted = await ScrapedData.insertMany(docs, { ordered: false });
      for (const d of inserted) insertedIds.push(d._id);
    }

    res.status(201).json({
      success: true,
      count: docs.length,
      duplicateCount: 0,
      totalReceived: records.length,
      batchNumber,
      insertedIds,
      duplicateIds: [],
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
// Returns the slice [from..to) of the unscraped-website pool.
//
// v1.8.6: the queue is now the deduped Website-Analysis collection (one row
// per UNIQUE website) instead of raw Scraped-Data. Raw Scraped-Data had ~14×
// duplicate URLs (5.9M rows → 423K unique), so the old queue made the scraper
// visit the same site over and over. The operator must run the Website
// Analysis (dedup) job first to populate this queue.
//
// All N CLI workers running the same task hit this with the same from/to and
// slice their own chunk locally.
router.get('/website-pool', async (req, res) => {
  try {
    const from = Math.max(0, parseInt(req.query.from, 10) || 0);
    const to   = parseInt(req.query.to,   10);
    if (!Number.isInteger(to) || to <= from) {
      return res.status(400).json({ error: 'to must be an integer > from' });
    }
    // Cap the per-request size so a typo (from=0 to=10000000) doesn't pull
    // millions of rows through the API server.
    const limit = Math.min(25000, to - from);

    const sites = await WebsiteAnalysis.find(
      { scrapWebsite: { $ne: true } },
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
// CLI sends one row per email and one row per phone harvested for one source
// website. Records are tagged scrapFrom='website' + scrapWebsite=true so the
// admin's website-scraper queue knows not to revisit them.
//
// Body: { sourceId, sourceWebsite?, records: [...], deviceId? }
//   sourceWebsite — the website URL the CLI just scraped. When present, the
//                   backend skips the sourceId→URL lookup (saves 1-2 findById
//                   queries per scrape). The CLI always knows this URL, so
//                   legacy callers are the only ones that pay for the fallback.
//
// v1.8.8 — No duplicate detection on the write path. Records save flat;
// the admin "Analyze Duplicates" action handles dedup post-hoc. See the
// long comment above /batch for the rationale (parallel-worker heat).
router.post('/from-website', async (req, res) => {
  try {
    const { sourceId, sourceWebsite, records, deviceId } = req.body;
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: 'records array required' });
    }

    touchDevice(deviceId, getClientIp(req));

    // Phone normalization — CPU-only, no DB roundtrip.
    for (const r of records) {
      const { phone: fixedPhone, fixed } = fixPhoneNumber(r.phone);
      r.phone = fixedPhone;
      r._numberFixing = fixed;
    }

    const docs = records.map((r) => ({
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
    }));

    const insertedIds = [];
    if (docs.length > 0) {
      try {
        const inserted = await ScrapedData.insertMany(docs, { ordered: false });
        for (const d of inserted) insertedIds.push(d._id);
      } catch (err) {
        // Partial success on unique-index collisions — keep what landed.
        for (const d of (err.insertedDocs || [])) insertedIds.push(d._id);
      }
    }

    // v1.8.7 — Send the response BEFORE doing the queue-flag mirror writes.
    // The CLI only cares that the contacts landed; the scrapWebsite flag
    // flips are housekeeping that the next worker pass observes. Detaching
    // them lets the CLI move on to its next site while Mongo handles the
    // updateMany in the background — cuts the per-site request latency in
    // half on a healthy run.
    res.status(201).json({
      success: true,
      count: docs.length,
      duplicateCount: 0,
      totalReceived: records.length,
      insertedIds,
      duplicateIds: [],
    });

    // Mark the source website scraped so the queue stops surfacing it.
    // The queue is now Website-Analysis (unique websites), so sourceId is a
    // WebsiteAnalysis _id — we resolve the website URL and mark BOTH
    // collections by URL: Website-Analysis (the scrape queue) AND Scraped-Data
    // (so the legacy admin browser-flow queue stays consistent too).
    //
    // v1.8.7 — when the CLI passes `sourceWebsite` in the body (the URL it
    // just scraped), skip the sourceId→URL lookup entirely. Across 4 parallel
    // workers each posting hundreds of sites/hour, that's 1-2 fewer findById
    // queries per scrape. The Scraped-Data `website` index (added in this
    // version) is what keeps the updateMany itself off the hot list — without
    // it, that updateMany was a full scan over ~6M rows.
    if (sourceId || sourceWebsite) {
      (async () => {
        try {
          let website = sourceWebsite || null;
          if (!website && sourceId) {
            const waSrc = await WebsiteAnalysis.findById(sourceId, { website: 1 }).lean();
            if (waSrc?.website) {
              website = waSrc.website;
            } else {
              const sdSrc = await ScrapedData.findById(sourceId, { website: 1 }).lean();
              website = sdSrc?.website || null;
            }
          }

          if (website) {
            const now = new Date();
            await Promise.all([
              WebsiteAnalysis.updateMany(
                { website },
                { $set: { scrapWebsite: true, contactScrapedAt: now } }
              ),
              ScrapedData.updateMany(
                { website },
                { $set: { scrapWebsite: true } }
              ),
            ]);
          } else if (sourceId) {
            // No URL resolved — at least flip the source row by id in both.
            await Promise.all([
              WebsiteAnalysis.updateOne({ _id: sourceId }, { $set: { scrapWebsite: true, contactScrapedAt: new Date() } }),
              ScrapedData.updateOne({ _id: sourceId }, { $set: { scrapWebsite: true } }),
            ]);
          }
        } catch (err) {
          console.error('[from-website mirror] Non-fatal:', err.message);
        }
      })();
    }
  } catch (err) {
    console.error('[scraped-data/from-website POST] Error:', err.message);
    res.status(500).json({ error: 'Server error', message: err.message });
  }
});

// PATCH /api/scraped-data/mark-website-scraped
// CLI calls this when a site yields no contacts — so the next worker pass
// doesn't keep revisiting dead URLs.
//
// Body: { ids?: [...], urls?: [...] }
//   ids   — Website-Analysis _ids (legacy / fallback). Requires a lookup.
//   urls  — v1.8.7: the CLI passes the URL it just visited directly, letting
//           the backend skip the lookup entirely. Either is accepted; if both
//           are present, urls wins.
//
// Marks BOTH Website-Analysis (the scrape queue) and Scraped-Data (legacy
// admin queue) by URL. Backed by the new Scraped-Data `website` index added
// in v1.8.7 — without it, this updateMany was a full scan on ~6M rows for
// EVERY dead site (and the website scraper hits many dead sites).
router.patch('/mark-website-scraped', async (req, res) => {
  try {
    const { ids, urls: bodyUrls } = req.body;
    const hasUrls = Array.isArray(bodyUrls) && bodyUrls.length > 0;
    const hasIds  = Array.isArray(ids) && ids.length > 0;
    if (!hasUrls && !hasIds) {
      return res.status(400).json({ error: 'ids or urls array required' });
    }

    let urls;
    if (hasUrls) {
      urls = [...new Set(bodyUrls.filter(Boolean))];
    } else {
      // Resolve URLs from the Website-Analysis queue first, fall back to
      // Scraped-Data for any legacy id.
      const waDocs = await WebsiteAnalysis.find({ _id: { $in: ids } }, { website: 1 }).lean();
      let resolved = waDocs.map((d) => d.website).filter(Boolean);
      if (resolved.length === 0) {
        const sdDocs = await ScrapedData.find({ _id: { $in: ids } }, { website: 1 }).lean();
        resolved = sdDocs.map((d) => d.website).filter(Boolean);
      }
      urls = [...new Set(resolved)];
    }

    const now = new Date();
    let modified = 0;
    if (urls.length > 0) {
      const [waR] = await Promise.all([
        WebsiteAnalysis.updateMany({ website: { $in: urls } }, { $set: { scrapWebsite: true, contactScrapedAt: now } }),
        ScrapedData.updateMany({ website: { $in: urls } }, { $set: { scrapWebsite: true } }),
      ]);
      modified = waR.modifiedCount;
    } else if (hasIds) {
      const waR = await WebsiteAnalysis.updateMany({ _id: { $in: ids } }, { $set: { scrapWebsite: true, contactScrapedAt: now } });
      modified = waR.modifiedCount;
    }
    res.json({ success: true, modified });
  } catch (err) {
    console.error('[scraped-data/mark-website-scraped PATCH] Error:', err.message);
    res.status(500).json({ error: 'Server error', message: err.message });
  }
});

module.exports = router;
