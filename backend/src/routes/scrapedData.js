const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ScrapedData = require('../models/ScrapedData');
const ExcelUpload = require('../models/ExcelUpload');
const SessionStats = require('../models/SessionStats');

// ── Multer config for Excel uploads ──
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
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
    const { batchNumber, deviceId, sessionId, records, timestamp, pincode: batchPincode } = req.body;

    if (!records || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: 'records array is required and must not be empty' });
    }

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

    // Split records into new (to insert) and duplicates (to mark & insert)
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
        scrapedAt: r.timestamp || timestamp,
      };

      if (existingKeys.has(key)) {
        dupDocs.push({ ...doc, isDuplicate: true });
      } else {
        // Add to existingKeys so within-batch duplicates are also caught
        existingKeys.add(key);
        newDocs.push({ ...doc, isDuplicate: false });
      }
    }

    // Insert new records
    const insertedIds = [];
    if (newDocs.length > 0) {
      const inserted = await ScrapedData.insertMany(newDocs, { ordered: false });
      for (const d of inserted) insertedIds.push(d._id);
    }

    // Insert duplicate records (marked isDuplicate: true)
    const duplicateIds = [];
    if (dupDocs.length > 0) {
      const dupInserted = await ScrapedData.insertMany(dupDocs, { ordered: false });
      for (const d of dupInserted) duplicateIds.push(d._id);
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
// Only $set fields that are actually provided (not undefined) so partial
// updates from different callers don't overwrite each other's data.
router.post('/session-stats', async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    // Build $set only from defined fields
    const fields = [
      'jobId', 'deviceId', 'keyword',
      'pincode', 'district', 'stateName',
      'category', 'subCategory', 'round',
      'totalRecords', 'insertedRecords', 'duplicateRecords',
      'batchesSent', 'excelUploaded', 'status',
      'startedAt', 'completedAt', 'durationMs',
    ];
    const $set = {};
    for (const key of fields) {
      if (req.body[key] !== undefined) {
        $set[key] = req.body[key];
      }
    }

    const doc = await SessionStats.findOneAndUpdate(
      { sessionId },
      { $set },
      { upsert: true, new: true }
    );

    res.status(201).json({ success: true, id: doc._id });
  } catch (err) {
    console.error('[scraped-data/session-stats POST] Error:', err.message);
    res.status(500).json({ error: 'Server error', message: err.message });
  }
});

// GET /api/scraped-data/session-stats/check-completed — check if a search is already completed
// Query params: keyword (the full search text — matches across ALL jobs/sessions)
router.get('/session-stats/check-completed', async (req, res) => {
  try {
    const { keyword } = req.query;
    if (!keyword) {
      return res.status(400).json({ error: 'keyword is required' });
    }
    const doc = await SessionStats.findOne({
      keyword: String(keyword),
      status: 'completed',
    }).lean();
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
      { pincode: 1, category: 1, subCategory: 1, round: 1, keyword: 1 }
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
