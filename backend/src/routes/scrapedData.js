const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ScrapedData = require('../models/ScrapedData');
const ExcelUpload = require('../models/ExcelUpload');
const SessionStats = require('../models/SessionStats');
const Device = require('../models/Device');

/** Fire-and-forget: mark device as online + update lastSeenAt + update IP */
function touchDevice(deviceId, ip) {
  if (!deviceId) return;
  const update = { lastSeenAt: new Date(), status: 'online' };
  if (ip) update.ip = ip;
  Device.updateOne({ deviceId }, { $set: update }).catch(() => {});
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || req.ip || '';
}

// ── Multer config for Excel uploads ──
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    // Ensure directory exists on every upload (survives restarts/deletions)
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.xlsx' || ext === '.xls') {
      cb(null, true);
    } else {
      cb(new Error('Only .xlsx and .xls files are allowed'));
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

/**
 * Build a duplicate key from the 5 fields: phone, rating, reviews, category, plusCode
 */
function dupKey(phone, rating, reviews, category, plusCode) {
  return `${phone || ''}|${rating || 0}|${reviews || 0}|${category || ''}|${plusCode || ''}`;
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

// POST /api/scraped-data/batch — receive batch of scraped records, deduplicate, and save to DB
router.post('/batch', async (req, res) => {
  try {
    const { batchNumber, deviceId, sessionId, records, timestamp, pincode: batchPincode, keyword: batchKeyword, scrapCategory: batchScrapCategory, scrapSubCategory: batchScrapSubCategory, round: batchRound } = req.body;

    if (!records || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: 'records array is required and must not be empty' });
    }

    touchDevice(deviceId, getClientIp(req));

    // ── Duplicate detection ──
    // Build $or conditions for all records to check existing duplicates
    const orConditions = records.map((r) => ({
      phone: r.phone || null,
      rating: r.rating || 0,
      reviews: r.reviews || 0,
      category: r.category || null,
      plusCode: r.plusCode || null,
    }));

    // Find existing records that match ALL 5 fields
    const existing = await ScrapedData.find(
      { $or: orConditions },
      { phone: 1, rating: 1, reviews: 1, category: 1, plusCode: 1 }
    ).lean();

    // Build a Set of existing duplicate keys
    const existingKeys = new Set();
    for (const e of existing) {
      existingKeys.add(dupKey(e.phone, e.rating, e.reviews, e.category, e.plusCode));
    }

    // Split records into new and duplicates — both are saved, duplicates flagged
    const newDocs = [];
    const dupDocs = [];

    for (const r of records) {
      const key = dupKey(r.phone, r.rating || 0, r.reviews || 0, r.category, r.plusCode);

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
      };

      if (existingKeys.has(key)) {
        doc.isDuplicate = true;
        dupDocs.push(doc);
      } else {
        // Add to existingKeys so within-batch duplicates are also caught
        existingKeys.add(key);
        doc.isDuplicate = false;
        newDocs.push(doc);
      }
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

// POST /api/scraped-data/excel — upload Excel file
router.post('/excel', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { sessionId, keyword, deviceId } = req.body;

    const doc = await ExcelUpload.create({
      sessionId: sessionId || 'unknown',
      deviceId: deviceId || undefined,
      keyword: keyword || '',
      fileName: req.file.originalname,
      filePath: req.file.path,
      fileSize: req.file.size,
    });

    res.status(201).json({
      success: true,
      id: doc._id,
      fileName: req.file.originalname,
      fileSize: req.file.size,
    });
  } catch (err) {
    console.error('[scraped-data/excel POST] Error:', err.message);
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
      'excelUploaded', 'status',
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

module.exports = router;
