const express = require('express');
const router = express.Router();
const { adminAuth, ADMIN_PASSWORD, issueToken } = require('../middleware/adminAuth');

const Device = require('../models/Device');
const DeviceHistory = require('../models/DeviceHistory');
const SessionStats = require('../models/SessionStats');
const ScrapeTracking = require('../models/ScrapeTracking');
const ScrapedData = require('../models/ScrapedData');
const ScrapedDataDuplicate = require('../models/ScrapedDataDuplicate');
const ScrapedDataDeleted = require('../models/ScrapedDataDeleted');
const WebsiteAnalysis = require('../models/WebsiteAnalysis');
const WebsiteAnalysisJob = require('../models/WebsiteAnalysisJob');
const PincodeStatus = require('../models/PincodeStatus');
const BusinessNiche = require('../models/BusinessNiche');
const PinCode = require('../models/PinCode');
const SearchStatus = require('../models/SearchStatus');
const { fixPhoneNumber } = require('../utils/phoneFixer');
const { escapeRegex } = require('../utils/mongoErrors');

// ── POST /api/admin/login ──
router.post('/login', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ success: false, error: 'Invalid admin password' });
    }
    const token = issueToken();
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
      { jobId: 1, deviceId: 1, startPincode: 1, endPincode: 1, status: 1, completedSearches: 1, totalSearches: 1, pincodeIndex: 1, updatedAt: 1 }
    ).sort({ updatedAt: -1 }).lean();

    // Build map: deviceId → array of tracking records (sorted newest first)
    const trackingByDevice = {};
    for (const doc of trackingDocs) {
      if (!trackingByDevice[doc.deviceId]) trackingByDevice[doc.deviceId] = [];
      trackingByDevice[doc.deviceId].push(doc);
    }

    // Summarize a single tracking doc → job progress
    const summarize = (t) => {
      const pct = t.totalSearches > 0 ? Math.round((t.completedSearches / t.totalSearches) * 100) : 0;
      // Calculate approximate current pincode from pincodeIndex (0-based index into range)
      const rangeSize = Math.max(t.endPincode - t.startPincode + 1, 1);
      const currentPincodeIdx = Math.min(t.pincodeIndex || 0, rangeSize - 1);
      const currentPincode = t.startPincode + currentPincodeIdx;
      return {
        jobId: t.jobId,
        startPincode: t.startPincode,
        endPincode: t.endPincode,
        totalPincodes: rangeSize,
        currentPincode,
        currentPincodeIndex: currentPincodeIdx + 1, // 1-based for display
        status: t.status,
        completedSearches: t.completedSearches,
        totalSearches: t.totalSearches,
        percent: pct,
        completedAt: t.status === 'completed' ? t.updatedAt : null,
      };
    };

    // Match a scrape task to ScrapeTracking doc(s)
    // For 'jobs' type: returns jobs[] array with multiple chunks
    const matchTaskProgress = (deviceId, task) => {
      const tracks = trackingByDevice[deviceId] || [];
      const startPin = Number(task.startPin);
      if (!startPin) return null;

      if (task.type === 'range') {
        const endPin = Number(task.endPin);
        const match = tracks.find((t) => t.startPincode === startPin && t.endPincode === endPin);
        return match ? summarize(match) : null;
      }
      if (task.type === 'single') {
        const match = tracks.find((t) => t.startPincode === startPin && t.endPincode === startPin);
        return match ? summarize(match) : null;
      }

      // 'jobs' type: find `task.jobs` sequential chunks starting at startPin
      // Each chunk is a separate ScrapeTracking record (one per 100 pincodes)
      const jobCount = Number(task.jobs) || 3;
      // Filter tracks at or after startPin, sort ASC by startPincode
      const candidates = tracks
        .filter((t) => t.startPincode >= startPin)
        .sort((a, b) => a.startPincode - b.startPincode);

      // Pick the first `jobCount` most-recently-updated chunks
      // To avoid picking old runs, prefer the most recent updatedAt cluster
      const recent = candidates.slice().sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      const chosenIds = new Set();
      const chosen = [];
      for (const c of recent) {
        if (chosenIds.has(c.jobId)) continue;
        chosenIds.add(c.jobId);
        chosen.push(c);
        if (chosen.length >= jobCount) break;
      }
      chosen.sort((a, b) => a.startPincode - b.startPincode);

      if (chosen.length === 0) return null;

      const jobs = chosen.map(summarize);
      const totalSearches = jobs.reduce((s, j) => s + j.totalSearches, 0);
      const completedSearches = jobs.reduce((s, j) => s + j.completedSearches, 0);
      const allCompleted = jobs.length === jobCount && jobs.every((j) => j.status === 'completed');
      const anyRunning = jobs.some((j) => j.status === 'running');
      const anyStopped = jobs.some((j) => j.status === 'stopped' || j.status === 'stop');
      const aggStatus = allCompleted ? 'completed' : anyRunning ? 'running' : anyStopped ? 'stopped' : jobs[0].status;
      const latestCompletedAt = allCompleted
        ? jobs.reduce((latest, j) => {
            const t = j.completedAt ? new Date(j.completedAt).getTime() : 0;
            return t > latest ? t : latest;
          }, 0)
        : null;

      return {
        status: aggStatus,
        completedSearches,
        totalSearches,
        percent: totalSearches > 0 ? Math.round((completedSearches / totalSearches) * 100) : 0,
        completedAt: latestCompletedAt ? new Date(latestCompletedAt) : null,
        jobs, // per-chunk details
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

/**
 * POST /api/admin/devices/bulk-add — register many VPS devices at once.
 *
 * Body:
 *   { rows: [{ ip, password, startPin?, jobs? }, ...] }
 *
 * For each row:
 *   - If a device with that IP exists (either as primary `ip` or in `ips[]`),
 *     update its password / startPin / jobs (whichever fields were supplied).
 *   - Otherwise create a new device record with minimal info — the rest fills
 *     in when the scraper actually runs on the VPS.
 *
 * Returns counts: { created, updated, rowsRejected, errors[] }.
 * Mirrors the single-device /devices/add behaviour so a bulk row is exactly
 * equivalent to N single posts.
 */
router.post('/devices/bulk-add', adminAuth, async (req, res) => {
  try {
    const { rows } = req.body || {};
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'rows array required (and must not be empty)' });
    }
    if (rows.length > 2000) {
      return res.status(413).json({ error: `Too many rows (${rows.length}); cap is 2000 per upload` });
    }

    const crypto = require('crypto');
    const errors = [];
    let created = 0;
    let updated = 0;
    let rowsRejected = 0;

    // Process sequentially — keeps order, lets us catch per-row errors without
    // aborting the rest. 2000 cap means this is bounded in time.
    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i] || {};
      const lineNo = i + 2; // header is row 1
      const ip = String(raw.ip ?? '').trim();
      if (!ip) {
        errors.push(`row ${lineNo}: missing 'ip'`);
        rowsRejected++;
        continue;
      }
      // Basic IPv4 shape check — not exhaustive, just catches obvious typos.
      // Accepts IPv6 too (skips the regex if there's a colon).
      if (!ip.includes(':') && !/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
        errors.push(`row ${lineNo}: '${ip}' is not a valid IPv4 address`);
        rowsRejected++;
        continue;
      }

      const password = raw.password != null ? String(raw.password) : '';
      const startPinStr = raw.startPin != null && raw.startPin !== '' ? String(raw.startPin).trim() : '';
      if (startPinStr) {
        const n = Number(startPinStr);
        if (!Number.isInteger(n) || n < 100000 || n > 999999) {
          errors.push(`row ${lineNo}: startPin '${startPinStr}' must be a 6-digit integer (100000-999999)`);
          rowsRejected++;
          continue;
        }
      }
      const jobsNum = raw.jobs != null && raw.jobs !== '' ? Number(raw.jobs) : 3;
      if (raw.jobs != null && raw.jobs !== '' && (!Number.isInteger(jobsNum) || jobsNum < 1 || jobsNum > 999)) {
        errors.push(`row ${lineNo}: jobs '${raw.jobs}' must be an integer between 1 and 999`);
        rowsRejected++;
        continue;
      }

      try {
        const existing = await Device.findOne({ $or: [{ ip }, { ips: ip }] });
        if (existing) {
          if (password) existing.vpsPassword = password;
          if (startPinStr) existing.scrapePincode = startPinStr;
          if (raw.jobs != null && raw.jobs !== '') existing.scrapeJobs = jobsNum;
          await existing.save();
          updated++;
        } else {
          await Device.create({
            deviceId:      crypto.randomUUID(),
            nickname:      ip,
            hostname:      'Pending setup',
            username:      'root',
            platform:      'linux',
            ip,
            ips:           [ip],
            isActive:      true,
            status:        'offline',
            vpsPassword:   password,
            scrapePincode: startPinStr,
            scrapeJobs:    jobsNum,
            lastSeenAt:    new Date(),
          });
          created++;
        }
      } catch (err) {
        errors.push(`row ${lineNo}: ${err.message}`);
        rowsRejected++;
      }
    }

    res.json({
      success: true,
      created,
      updated,
      rowsAccepted: rows.length - rowsRejected,
      rowsRejected,
      errors,
    });
  } catch (err) {
    console.error('[admin/devices/bulk-add] Error:', err.message);
    res.status(500).json({ error: 'Server error', message: err.message });
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
/**
 * POST /api/admin/devices/bulk-tasks
 *
 * Replace scrapeTasks across many devices in one shot. Used by the admin's
 * "Bulk Tasks" CSV upload — three separate flows (range / single / jobs)
 * share this single backend entry by sending `type` and a flat row array.
 *
 * Body:
 *   {
 *     type: 'range' | 'single' | 'jobs',
 *     rows: [
 *       { device: '187.127.165.150', startPin: '700001', endPin: '700100' },     // range
 *       { device: '187.127.165.150', startPin: '700001' },                        // single
 *       { device: '187.127.165.150', startPin: '700001', jobs: 5 },               // jobs
 *       ...
 *     ]
 *   }
 *
 * Device matching: `device` may be an IP, the device.deviceId, or a nickname.
 * Tried in that order. Multiple rows for the same device are grouped into
 * one scrapeTasks array; the device's full scrapeTasks is REPLACED (not
 * appended) — matching the operator's "remove/override, not append" intent.
 *
 * Response:
 *   { success, devicesUpdated, rowsAccepted, rowsRejected, errors[] }
 */
/**
 * POST /api/admin/devices/clear-completed-tasks
 *
 * Removes from every device's scrapeTasks array any `range` or `single` task
 * whose corresponding ScrapeTracking record is status='completed'. Keeps
 * `jobs`-type tasks untouched (they have N sub-trackings; the "fully done"
 * decision is non-trivial — operator can clean those manually).
 *
 * Returns: { success, devicesModified, tasksRemoved }.
 */
router.post('/devices/clear-completed-tasks', adminAuth, async (req, res) => {
  try {
    const devices = await Device.find(
      { isArchived: { $ne: true } },
      { deviceId: 1, scrapeTasks: 1 }
    ).lean();

    if (devices.length === 0) {
      return res.json({ success: true, devicesModified: 0, tasksRemoved: 0 });
    }

    // One query for every relevant tracking doc, grouped client-side
    const deviceIds = devices.map((d) => d.deviceId);
    const tracks = await ScrapeTracking.find(
      { deviceId: { $in: deviceIds } },
      { deviceId: 1, startPincode: 1, endPincode: 1, status: 1 }
    ).lean();

    const tracksByDevice = {};
    for (const t of tracks) {
      (tracksByDevice[t.deviceId] = tracksByDevice[t.deviceId] || []).push(t);
    }

    let tasksRemoved = 0;
    const ops = [];
    for (const d of devices) {
      const oldTasks = d.scrapeTasks || [];
      if (oldTasks.length === 0) continue;
      const myTracks = tracksByDevice[d.deviceId] || [];

      const newTasks = oldTasks.filter((t) => {
        // Always keep 'jobs' tasks — they map to multiple chunks, deciding
        // "is this whole task done?" needs more bookkeeping than this
        // simple cleanup is meant to do.
        if (t.type === 'jobs') return true;
        const startPin = Number(t.startPin);
        if (!Number.isFinite(startPin)) return true;
        const endPin = t.type === 'range' ? Number(t.endPin) : startPin;
        if (!Number.isFinite(endPin)) return true;
        const match = myTracks.find(
          (tr) => tr.startPincode === startPin && tr.endPincode === endPin
        );
        // Keep if no tracking doc exists OR it's not completed.
        return !match || match.status !== 'completed';
      });

      const removedHere = oldTasks.length - newTasks.length;
      if (removedHere > 0) {
        tasksRemoved += removedHere;
        ops.push({
          updateOne: {
            filter: { _id: d._id },
            update: { $set: { scrapeTasks: newTasks } },
          },
        });
      }
    }

    let devicesModified = 0;
    if (ops.length > 0) {
      const result = await Device.bulkWrite(ops, { ordered: false });
      devicesModified = result.modifiedCount || 0;
    }

    res.json({ success: true, devicesModified, tasksRemoved });
  } catch (err) {
    console.error('[admin/devices/clear-completed-tasks] Error:', err.message);
    res.status(500).json({ error: 'Server error', message: err.message });
  }
});

router.post('/devices/bulk-tasks', adminAuth, async (req, res) => {
  try {
    const { type, rows } = req.body || {};
    if (type !== 'range' && type !== 'single' && type !== 'jobs') {
      return res.status(400).json({ error: "type must be 'range', 'single', or 'jobs'" });
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'rows array required (and must not be empty)' });
    }
    if (rows.length > 5000) {
      return res.status(413).json({ error: `Too many rows (${rows.length}); cap is 5000 per upload` });
    }

    const errors = [];
    // Group rows by deviceKey. Validate each before adding.
    /** @type {Map<string, Array<{type:string,startPin:string,endPin:string,jobs:number}>>} */
    const grouped = new Map();
    let rowsRejected = 0;

    rows.forEach((raw, idx) => {
      const lineNo = idx + 2; // 1 = header, 2 = first data row (matches spreadsheet row numbers)
      const deviceKey = String(raw?.device ?? '').trim();
      const startPinStr = String(raw?.startPin ?? '').trim();
      if (!deviceKey) { errors.push(`row ${lineNo}: missing 'device'`); rowsRejected++; return; }
      if (!startPinStr) { errors.push(`row ${lineNo}: missing 'startPin'`); rowsRejected++; return; }
      const startPinNum = Number(startPinStr);
      if (!Number.isInteger(startPinNum) || startPinNum < 100000 || startPinNum > 999999) {
        errors.push(`row ${lineNo}: startPin must be a 6-digit integer (got "${startPinStr}")`);
        rowsRejected++;
        return;
      }

      const task = { type, startPin: startPinStr, endPin: '', jobs: 0 };

      if (type === 'range') {
        const endPinStr = String(raw?.endPin ?? '').trim();
        if (!endPinStr) { errors.push(`row ${lineNo}: missing 'endPin' for range task`); rowsRejected++; return; }
        const endPinNum = Number(endPinStr);
        if (!Number.isInteger(endPinNum) || endPinNum < 100000 || endPinNum > 999999) {
          errors.push(`row ${lineNo}: endPin must be a 6-digit integer (got "${endPinStr}")`);
          rowsRejected++;
          return;
        }
        if (endPinNum < startPinNum) {
          errors.push(`row ${lineNo}: endPin (${endPinNum}) must be ≥ startPin (${startPinNum})`);
          rowsRejected++;
          return;
        }
        task.endPin = endPinStr;
      } else if (type === 'jobs') {
        const jobsNum = Number(raw?.jobs);
        if (!Number.isInteger(jobsNum) || jobsNum < 1 || jobsNum > 999) {
          errors.push(`row ${lineNo}: jobs must be an integer between 1 and 999 (got "${raw?.jobs}")`);
          rowsRejected++;
          return;
        }
        task.jobs = jobsNum;
      }
      // 'single' needs only startPin — already validated.

      if (!grouped.has(deviceKey)) grouped.set(deviceKey, []);
      grouped.get(deviceKey).push(task);
    });

    if (grouped.size === 0) {
      return res.status(400).json({ error: 'No valid rows after validation', errors });
    }

    // Resolve deviceKey → device document. Match against ANY known identifier:
    // primary `ip` (first registration), the `ips` array (all observed IPs —
    // critical for VPS that reconnect from a new IP), `deviceId`, or `nickname`.
    // Previously only `ip` was checked, so a CSV row using the device's
    // current IP would silently fall into `devicesNotFound` if the device
    // had been re-registered from a different IP at some point.
    const keys = [...grouped.keys()];
    const deviceDocs = await Device.find(
      {
        $or: [
          { ip:       { $in: keys } },
          { ips:      { $in: keys } },
          { deviceId: { $in: keys } },
          { nickname: { $in: keys } },
        ],
      },
      { _id: 1, deviceId: 1, ip: 1, ips: 1, nickname: 1 }
    ).lean();

    // Build a map from any of {ip, every entry in ips[], deviceId, nickname}
    // → device _id, so a row using ANY known identifier resolves.
    const keyToId = new Map();
    for (const d of deviceDocs) {
      if (d.ip)       keyToId.set(d.ip, d._id);
      if (d.deviceId) keyToId.set(d.deviceId, d._id);
      if (d.nickname) keyToId.set(d.nickname, d._id);
      if (Array.isArray(d.ips)) {
        for (const ip of d.ips) if (ip) keyToId.set(ip, d._id);
      }
    }

    let devicesUpdated = 0;
    let devicesMatched = 0;
    const devicesNotFound = [];

    // Bulk write — one updateOne per device, fast even for ~hundreds of devices.
    // Dedupe by _id in case multiple keys (ip/nickname/deviceId) resolved to
    // the same device — we only want one op per device.
    const opsByDeviceId = new Map();
    for (const [key, tasks] of grouped.entries()) {
      const id = keyToId.get(key);
      if (!id) { devicesNotFound.push(key); continue; }
      const idStr = String(id);
      // If two keys map to the same device, the later one wins (operator
      // probably intended one task list per device anyway).
      opsByDeviceId.set(idStr, {
        updateOne: {
          filter: { _id: id },
          update: { $set: { scrapeTasks: tasks } },
        },
      });
    }
    const ops = [...opsByDeviceId.values()];

    if (ops.length > 0) {
      const result = await Device.bulkWrite(ops, { ordered: false });
      // matchedCount = devices the filter found (i.e. successfully persisted
      //                even if the new value happened to equal the old value)
      // modifiedCount = subset where the value actually changed
      // Both numbers are useful: matched tells the user "saved", modified
      // tells them "something actually differed".
      devicesMatched = result.matchedCount  || 0;
      devicesUpdated = result.modifiedCount || 0;
    }

    for (const k of devicesNotFound) errors.push(`device "${k}" not found (tried IP/ips/deviceId/nickname)`);

    res.json({
      success: true,
      type,
      devicesMatched,
      devicesUpdated,
      devicesNotFound: devicesNotFound.length,
      rowsAccepted: rows.length - rowsRejected,
      rowsRejected,
      errors,
    });
  } catch (err) {
    console.error('[admin/devices/bulk-tasks] Error:', err.message);
    res.status(500).json({ error: 'Server error', message: err.message });
  }
});

router.patch('/devices/:deviceId/scrape-tasks', adminAuth, async (req, res) => {
  try {
    const { tasks } = req.body;
    if (!Array.isArray(tasks)) return res.status(400).json({ error: 'tasks array required' });

    // Validate + normalize each task. Pincode-typed tasks (jobs/range/single)
    // require a startPin; website tasks don't — they pull from the global
    // unscraped-website pool.
    const ALLOWED_TYPES = new Set(['jobs', 'range', 'single', 'website']);
    const normalized = tasks
      .map((t) => {
        const type = ALLOWED_TYPES.has(t.type) ? t.type : 'jobs';
        if (type === 'website') {
          // Accept either the new (rangeFrom + rangeTo) form OR the legacy
          // (limit-only) form. We always normalize back to rangeFrom/rangeTo
          // so the CLI and admin chip can rely on the explicit slice.
          const rangeFrom = Math.max(0, Number(t.rangeFrom) || 0);
          let rangeTo = Number(t.rangeTo);
          if (!Number.isFinite(rangeTo) || rangeTo <= rangeFrom) {
            const legacyLimit = Math.max(1, Number(t.limit) || 100);
            rangeTo = rangeFrom + legacyLimit;
          }
          return {
            type,
            startPin: '',
            endPin: '',
            jobs: 0,
            rangeFrom,
            rangeTo,
            limit: rangeTo - rangeFrom,  // mirror for back-compat consumers
            workers: Math.max(1, Math.min(16, Number(t.workers) || 4)),
          };
        }
        const startPin = String(t.startPin || '').trim();
        if (!startPin) return null;
        return {
          type,
          startPin,
          endPin: type === 'range' ? String(t.endPin || '').trim() : '',
          jobs:   type === 'jobs'  ? (Number(t.jobs) || 3) : 0,
          rangeFrom: 0,
          rangeTo: 0,
          limit:   0,
          workers: 0,
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
    if (keyword) filter.keyword = { $regex: escapeRegex(keyword), $options: 'i' };
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
      pincodesCovered,
    ] = await Promise.all([
      ScrapedData.countDocuments(),
      ScrapedData.countDocuments({ isDuplicate: true }),
      // "Active" / "Inactive" on the Devices page = currently-online vs not,
      // among non-archived devices. The previous query used `isActive`, a
      // soft-delete flag that defaults to true on creation and never changes
      // — so it over-counted by including every archived/decommissioned VPS.
      // Aligning both counts with the Devices page semantics.
      Device.countDocuments({ status: 'online',          isArchived: { $ne: true } }),
      Device.countDocuments({ status: { $ne: 'online' }, isArchived: { $ne: true } }),
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
      ScrapedData.distinct('pincode', { pincode: { $ne: null } }),
    ]);

    // Scope job counts to non-archived devices only — otherwise stale
    // tracking docs from old / decommissioned VPSes show up in "Jobs
    // Running", inflating the dashboard number.
    const liveDeviceIds = await Device.distinct('deviceId', { isArchived: { $ne: true } });
    const [jobsRunningLive, jobsCompletedLive] = await Promise.all([
      ScrapeTracking.countDocuments({ deviceId: { $in: liveDeviceIds }, status: { $in: ['running', 'paused'] } }),
      ScrapeTracking.countDocuments({ deviceId: { $in: liveDeviceIds }, status: 'completed' }),
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
      jobsInProgress: jobsRunningLive,
      jobsCompleted: jobsCompletedLive,
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
// Merges BusinessNiche subcategories (planned) with scraped aggregation.
// Returns all subcategories in the niche plus any extras that appear in
// scraped data (e.g. ad-hoc/unregistered). Every subcategory shows:
//   - subCategory, count, devices, rounds
//   - inNiches (true if defined in BusinessNiche)
//   - nicheId (the BusinessNiche doc id, if any — used for deletion)
router.get('/categories/:category/subcategories', async (req, res) => {
  try {
    const { category } = req.params;

    // Match category by either field (scrapCategory is the actual scraped label)
    const [scrapedAgg, niches] = await Promise.all([
      ScrapedData.aggregate([
        {
          $match: {
            $or: [
              { category: category },
              { scrapCategory: category },
            ],
          },
        },
        {
          $group: {
            _id: '$scrapSubCategory',
            count: { $sum: 1 },
            devices: { $addToSet: '$deviceId' },
            rounds: { $addToSet: '$scrapRound' },
          },
        },
      ]),
      BusinessNiche.find({ Category: category }, { SubCategory: 1 }).sort({ SubCategory: 1 }).lean(),
    ]);

    // Build lookup: subCategory name → scraped stats
    const statsByName = {};
    for (const a of scrapedAgg) {
      const name = a._id || 'Uncategorized';
      statsByName[name] = {
        count: a.count,
        devices: (a.devices || []).filter(Boolean).length,
        rounds: (a.rounds || []).filter((r) => r != null).sort((x, y) => x - y),
      };
    }

    // Seed output with BusinessNiche entries (planned, even if 0 records)
    const outputByName = {};
    for (const n of niches) {
      const name = n.SubCategory;
      const stats = statsByName[name] || { count: 0, devices: 0, rounds: [] };
      outputByName[name] = {
        subCategory: name,
        inNiches: true,
        nicheId: String(n._id),
        ...stats,
      };
    }

    // Add any scraped subcategories NOT in niches
    for (const [name, stats] of Object.entries(statsByName)) {
      if (!outputByName[name]) {
        outputByName[name] = {
          subCategory: name,
          inNiches: false,
          nicheId: null,
          ...stats,
        };
      }
    }

    // Sort: scraped (count desc) first, then planned alphabetical
    const subCategories = Object.values(outputByName).sort((a, b) => {
      if (a.count !== b.count) return b.count - a.count;
      return a.subCategory.localeCompare(b.subCategory);
    });

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

// ── GET /api/admin/pincodes/coming-status/sample ──
// Returns every Nth pincode (offsets 0, step, 2*step, …) from the same
// sorted+filtered set the coming-status page paginates over. Useful for
// downloading a spread sample without pulling the full 19k+ dataset.
router.get('/pincodes/coming-status/sample', async (req, res) => {
  try {
    const { state, district, statusFilter, step: stepQ } = req.query;
    const step = Math.max(1, Math.min(10000, parseInt(stepQ, 10) || 100));

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

    const sourceCount = merged.length;
    const samples = [];
    // Take row at offsets 0, step, 2*step, … — i.e. the first row of each "page".
    // Also tally per-page status counts so the Excel sample can show how
    // each page breaks down (running/completed/stop/pending) without the
    // admin having to download every page separately.
    for (let i = 0; i < merged.length; i += step) {
      const pageEnd = Math.min(i + step, merged.length);
      const pageCounts = { running: 0, completed: 0, stop: 0, pending: 0 };
      for (let j = i; j < pageEnd; j++) {
        const s = merged[j].status;
        if (s in pageCounts) pageCounts[s]++;
      }
      samples.push({
        ...merged[i],
        pageNumber: Math.floor(i / step) + 1,
        sourceIndex: i,
        pageSize: pageEnd - i,
        pageCounts,
      });
    }

    res.json({ samples, step, total: samples.length, sourceCount });
  } catch (err) {
    console.error('[admin/pincodes/coming-status/sample] Error:', err.message);
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
          { District: { $regex: escapeRegex(search), $options: 'i' } },
          { StateName: { $regex: escapeRegex(search), $options: 'i' } },
          { CircleName: { $regex: escapeRegex(search), $options: 'i' } },
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

/**
 * Normalize + validate a pincode payload coming from the admin UI.
 * Returns { ok: true, doc } or { ok: false, error }.
 * Pass `existingId` on updates so the uniqueness check excludes self.
 */
async function validatePincodePayload(body, { existingId = null } = {}) {
  const pincodeNum = Number(body.Pincode);
  if (!Number.isInteger(pincodeNum) || pincodeNum <= 0) {
    return { ok: false, error: 'Pincode must be a positive integer' };
  }

  // Uniqueness — same Pincode shouldn't appear twice
  const dupFilter = { Pincode: pincodeNum };
  if (existingId) dupFilter._id = { $ne: existingId };
  const dup = await PinCode.findOne(dupFilter, { _id: 1 }).lean();
  if (dup) return { ok: false, error: `Pincode ${pincodeNum} already exists` };

  const trim = (v) => (typeof v === 'string' ? v.trim() : v);
  const doc = {
    Pincode:    pincodeNum,
    CircleName: trim(body.CircleName) || '',
    District:   trim(body.District)   || '',
    StateName:  trim(body.StateName)  || '',
    Latitude:   trim(body.Latitude)   || '',
    Longitude:  trim(body.Longitude)  || '',
    Country:    trim(body.Country)    || 'India',
  };
  return { ok: true, doc };
}

// ── POST /api/admin/pincodes — create a new pincode ──
router.post('/pincodes', async (req, res) => {
  try {
    const { ok, error, doc } = await validatePincodePayload(req.body);
    if (!ok) return res.status(400).json({ error });
    const created = await PinCode.create(doc);
    res.status(201).json({ success: true, data: created.toObject() });
  } catch (err) {
    console.error('[admin/pincodes POST] Error:', err.message);
    res.status(500).json({ error: 'Server error', message: err.message });
  }
});

// ── PATCH /api/admin/pincodes/:id — update an existing pincode ──
router.patch('/pincodes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await PinCode.findById(id).lean();
    if (!existing) return res.status(404).json({ error: 'Pincode not found' });

    const { ok, error, doc } = await validatePincodePayload(req.body, { existingId: id });
    if (!ok) return res.status(400).json({ error });

    const updated = await PinCode.findByIdAndUpdate(id, { $set: doc }, { new: true }).lean();
    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[admin/pincodes PATCH] Error:', err.message);
    res.status(500).json({ error: 'Server error', message: err.message });
  }
});

// ── DELETE /api/admin/pincodes/:id — delete a pincode ──
router.delete('/pincodes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await PinCode.findByIdAndDelete(id).lean();
    if (!result) return res.status(404).json({ error: 'Pincode not found' });
    res.json({ success: true, deletedId: id });
  } catch (err) {
    console.error('[admin/pincodes DELETE] Error:', err.message);
    res.status(500).json({ error: 'Server error', message: err.message });
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
      { name: { $regex: escapeRegex(search), $options: 'i' } },
      { nameEnglish: { $regex: escapeRegex(search), $options: 'i' } },
      { scrapKeyword: { $regex: escapeRegex(search), $options: 'i' } },
      { address: { $regex: escapeRegex(search), $options: 'i' } },
      { phone: { $regex: escapeRegex(search), $options: 'i' } },
      { email: { $regex: escapeRegex(search), $options: 'i' } },
      { website: { $regex: escapeRegex(search), $options: 'i' } },
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

// ─────────────────────────────────────────────────────────────────────────────
// Deleted-records archive — view + restore + purge
//
// Records moved to Scraped-Data-Deleted by `soft-delete` / `soft-delete-filter`
// are kept indefinitely for safety. These routes give the admin a way back:
//   - list / search / paginate the archive
//   - restore selected ids (or everything matching a filter)
//   - permanently purge from the archive
//
// Restore and purge both require re-confirming the admin password in the body
// even though the session token is already valid — these operations move /
// delete tens of thousands of rows and shouldn't run on a typo'd click.
// ─────────────────────────────────────────────────────────────────────────────

/** Same field set as buildScrapDbFilter, but applied to the Deleted collection. */
function buildDeletedRecordsFilter(params) {
  // The deleted-archive carries the same field shape as Scraped-Data, so we
  // reuse the existing filter builder verbatim instead of duplicating regexes.
  return buildScrapDbFilter(params);
}

// GET /api/admin/deleted-records — paginated list
router.get('/deleted-records', async (req, res) => {
  try {
    const { page = 1, limit = 25, sortBy = 'deletedAt', sortOrder = 'desc', ...filterParams } = req.query;
    const filter = buildDeletedRecordsFilter(filterParams);
    const skip = (Number(page) - 1) * Number(limit);
    const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const [data, total] = await Promise.all([
      ScrapedDataDeleted.find(filter).sort(sort).skip(skip).limit(Number(limit)).lean(),
      ScrapedDataDeleted.countDocuments(filter),
    ]);

    res.json({ data, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('[admin/deleted-records] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/deleted-records/count — quick total (used by the sidebar badge)
router.get('/deleted-records/count', async (_req, res) => {
  try {
    const total = await ScrapedDataDeleted.countDocuments({});
    res.json({ total });
  } catch (err) {
    console.error('[admin/deleted-records/count] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/admin/deleted-records/restore — restore by ids (admin password required)
// Body: { ids: [...], password: '...' }
router.post('/deleted-records/restore', async (req, res) => {
  try {
    const { ids, password } = req.body;
    if (!password || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Invalid admin password' });
    }
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array required' });
    }

    const BATCH = 500;
    let restoredCount = 0;

    for (let i = 0; i < ids.length; i += BATCH) {
      const batchIds = ids.slice(i, i + BATCH);
      const records = await ScrapedDataDeleted.find({ _id: { $in: batchIds } }).lean();
      if (records.length === 0) continue;

      // Strip archive-only fields (deletedAt, originalId) and the archive _id so
      // mongo assigns a fresh one. We don't try to preserve the original _id
      // because it may collide with whatever was inserted in the meantime.
      const cleanDocs = records.map((r) => {
        const { _id, __v, deletedAt, originalId, ...rest } = r;
        return rest;
      });
      await ScrapedData.insertMany(cleanDocs, { ordered: false });
      await ScrapedDataDeleted.deleteMany({ _id: { $in: batchIds } });
      restoredCount += records.length;
    }

    res.json({ success: true, restoredCount });
  } catch (err) {
    console.error('[admin/deleted-records/restore] Error:', err.message);
    res.status(500).json({ error: 'Server error', message: err.message });
  }
});

// POST /api/admin/deleted-records/restore-all — restore every record matching a filter
// Body: { filter?: {...}, password: '...' }
router.post('/deleted-records/restore-all', async (req, res) => {
  try {
    const { filter: rawFilter, password } = req.body;
    if (!password || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Invalid admin password' });
    }

    const filter = buildDeletedRecordsFilter(rawFilter || {});
    const BATCH = 500;
    let restoredCount = 0;

    while (true) {
      const records = await ScrapedDataDeleted.find(filter).limit(BATCH).lean();
      if (records.length === 0) break;
      const batchIds = records.map((r) => r._id);
      const cleanDocs = records.map((r) => {
        const { _id, __v, deletedAt, originalId, ...rest } = r;
        return rest;
      });
      await ScrapedData.insertMany(cleanDocs, { ordered: false });
      await ScrapedDataDeleted.deleteMany({ _id: { $in: batchIds } });
      restoredCount += records.length;
    }

    res.json({ success: true, restoredCount });
  } catch (err) {
    console.error('[admin/deleted-records/restore-all] Error:', err.message);
    res.status(500).json({ error: 'Server error', message: err.message });
  }
});

// DELETE /api/admin/deleted-records/purge — permanently delete from the archive
// Body: { ids?: [...], filter?: {...}, password: '...' }
// Exactly one of ids/filter must be present. After this the records cannot be
// recovered through the admin UI.
router.delete('/deleted-records/purge', async (req, res) => {
  try {
    const { ids, filter: rawFilter, password } = req.body;
    if (!password || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Invalid admin password' });
    }
    const hasIds = Array.isArray(ids) && ids.length > 0;
    const hasFilter = rawFilter && typeof rawFilter === 'object';
    if (!hasIds && !hasFilter) {
      return res.status(400).json({ error: 'ids array or filter required' });
    }

    const filter = hasIds
      ? { _id: { $in: ids } }
      : buildDeletedRecordsFilter(rawFilter);

    const result = await ScrapedDataDeleted.deleteMany(filter);
    res.json({ success: true, purgedCount: result.deletedCount || 0 });
  } catch (err) {
    console.error('[admin/deleted-records/purge] Error:', err.message);
    res.status(500).json({ error: 'Server error', message: err.message });
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

// ── GET /api/admin/website-scraper/stats ──
// Aggregate overview for the Website Scraper page header.
// Returns: source-pool counts (total/scraped/pending/unique), harvested
// contact counts, and the last N CLI website-worker runs (from Session-Stats).
//
// Implementation notes:
//  - "Source pool" = Scraped-Data rows with scrapFrom='G-Map' AND a website.
//    Unscraped means `scrapWebsite` is not true.
//  - "Harvested" = rows written by either flow (admin-browser scraping marks
//    them scrapFrom='website'; CLI WEB mode marks them scrapFrom='Website').
//    We match case-insensitively to count both.
//  - Phones / emails counted only when present (not empty string / null) so
//    the numbers reflect actual extracted contacts, not just row count.
//  - Recent runs come from SessionStats keyword prefix 'website-worker-' —
//    the CLI WEB mode writes one such row per worker on completion.
router.get('/website-scraper/stats', async (_req, res) => {
  try {
    const POOL_FILTER = {
      scrapFrom: 'G-Map',
      website: { $nin: [null, ''] },
    };
    const HARVESTED_FILTER = {
      // case-insensitive match — admin flow writes 'website', CLI writes 'Website'
      scrapFrom: { $regex: /^website$/i },
    };

    const [
      totalSource,
      scrapedCount,
      uniqueUrls,
      harvestedRecords,
      harvestedWithPhone,
      harvestedWithEmail,
      recentRuns,
    ] = await Promise.all([
      ScrapedData.countDocuments(POOL_FILTER),
      ScrapedData.countDocuments({ ...POOL_FILTER, scrapWebsite: true }),
      // estimatedDocumentCount on a $group is impossible — use aggregation
      ScrapedData.aggregate([
        { $match: POOL_FILTER },
        { $group: { _id: '$website' } },
        { $count: 'count' },
      ]).then((rows) => rows[0]?.count || 0),
      ScrapedData.countDocuments(HARVESTED_FILTER),
      ScrapedData.countDocuments({ ...HARVESTED_FILTER, phone: { $nin: [null, ''] } }),
      ScrapedData.countDocuments({ ...HARVESTED_FILTER, email: { $nin: [null, ''] } }),
      SessionStats.find(
        { keyword: { $regex: /^website-worker-/ } },
        {
          keyword: 1, deviceId: 1, totalRecords: 1, insertedRecords: 1,
          duplicateRecords: 1, batchesSent: 1, status: 1, startedAt: 1,
          completedAt: 1, durationMs: 1,
        }
      ).sort({ completedAt: -1, createdAt: -1 }).limit(10).lean(),
    ]);

    res.json({
      pool: {
        total: totalSource,
        scraped: scrapedCount,
        pending: Math.max(0, totalSource - scrapedCount),
        uniqueUrls,
      },
      harvested: {
        records: harvestedRecords,
        withPhone: harvestedWithPhone,
        withEmail: harvestedWithEmail,
      },
      recentRuns,
    });
  } catch (err) {
    console.error('[admin/website-scraper/stats] Error:', err.message);
    res.status(500).json({ error: 'Server error', message: err.message });
  }
});

// ── POST /api/admin/scrap-database/fix-numbers ──
// Backfill: normalizes the `phone` field on every record that hasn't been fixed
// yet (numberFixing !== true) and has a non-empty phone. Applies the same
// pipeline as the batch endpoint: strip spaces/hyphens/backticks, drop leading
// zeros, ensure a leading '+' with '+91' prefix if not international.
router.post('/scrap-database/fix-numbers', async (req, res) => {
  try {
    const BATCH = 500;
    let scanned = 0;
    let modified = 0;
    let lastId = null;

    while (true) {
      const filter = {
        phone: { $nin: [null, ''] },
        numberFixing: { $ne: true },
      };
      if (lastId) filter._id = { $gt: lastId };

      const records = await ScrapedData
        .find(filter, { phone: 1 })
        .sort({ _id: 1 })
        .limit(BATCH)
        .lean();

      if (records.length === 0) break;
      scanned += records.length;
      lastId = records[records.length - 1]._id;

      const ops = [];
      for (const r of records) {
        const { phone: fixedPhone, fixed } = fixPhoneNumber(r.phone);
        if (!fixed) continue;
        ops.push({
          updateOne: {
            filter: { _id: r._id },
            update: { $set: { phone: fixedPhone, numberFixing: true } },
          },
        });
      }

      if (ops.length > 0) {
        const result = await ScrapedData.bulkWrite(ops, { ordered: false });
        modified += result.modifiedCount || 0;
      }
    }

    res.json({ success: true, scanned, modified });
  } catch (err) {
    console.error('[admin/scrap-database/fix-numbers] Error:', err.message);
    res.status(500).json({ error: 'Server error', message: err.message });
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
        { name: { $regex: escapeRegex(search), $options: 'i' } },
        { phone: { $regex: escapeRegex(search), $options: 'i' } },
        { address: { $regex: escapeRegex(search), $options: 'i' } },
        { website: { $regex: escapeRegex(search), $options: 'i' } },
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
        { name: { $regex: escapeRegex(search), $options: 'i' } },
        { phone: { $regex: escapeRegex(search), $options: 'i' } },
        { address: { $regex: escapeRegex(search), $options: 'i' } },
        { website: { $regex: escapeRegex(search), $options: 'i' } },
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

// ─────────────────────────────────────────────────────────────────────────────
// Website Analysis — long-running website-dedup job
//
// Use case: from the ~7M scraped records, build a deduped archive of one row
// per unique website (filter: website present AND scrapFrom='G-Map'). The job
// can take many minutes, so the start endpoint returns immediately with a job
// id; the admin polls /jobs/:id for progress and reads /jobs for history.
//
// Dedup mechanism: WebsiteAnalysis has a unique index on `website`. We
// insertMany with ordered:false; the driver rejects E11000 duplicates per-row
// while still inserting the rest. That's faster than find-then-insert at
// scale and survives crashes (the unique index keeps the archive consistent
// even if a job is resumed).
//
// Crash recovery: each batch updates `lastProgressAt`. If /start is called and
// the latest job is "running" but stale (>10 min), we mark it as 'stopped'
// and let the new run begin. Without this, a server restart mid-job would
// leave a phantom "running" job forever.
// ─────────────────────────────────────────────────────────────────────────────

const WA_FILTER = {
  scrapFrom: 'G-Map',
  website: { $nin: [null, ''] },
};
const WA_BATCH = 500;
const WA_HEARTBEAT_STALE_MS = 10 * 60 * 1000; // 10 min

/**
 * Background worker. Streams matching Scraped-Data rows, batches them, and
 * insertMany's into WebsiteAnalysis with ordered:false. Updates the job doc
 * incrementally so the UI can show live progress without long-polling the
 * source collection. Fire-and-forget from the start endpoint.
 */
async function runWebsiteAnalysisJob(jobId) {
  const job = await WebsiteAnalysisJob.findById(jobId);
  if (!job) return;
  try {
    const total = await ScrapedData.countDocuments(WA_FILTER);
    job.totalToProcess = total;
    job.status = 'running';
    job.lastProgressAt = new Date();
    await job.save();

    const cursor = ScrapedData.find(WA_FILTER, {
      sessionId: 1, deviceId: 1, name: 1, nameEnglish: 1, nameLocal: 1,
      address: 1, phone: 1, email: 1, website: 1, rating: 1, reviews: 1,
      category: 1, pincode: 1, plusCode: 1, photoUrl: 1, latitude: 1,
      longitude: 1, mapsUrl: 1, scrapKeyword: 1, scrapCategory: 1,
      scrapSubCategory: 1, scrapRound: 1, scrapedAt: 1, scrapFrom: 1,
    }).lean().cursor({ batchSize: WA_BATCH });

    let buffer = [];

    const flush = async () => {
      if (buffer.length === 0) return;
      const docs = buffer.map((r) => {
        const { _id, ...rest } = r;
        return { ...rest, sourceId: String(_id) };
      });
      buffer = [];

      try {
        await WebsiteAnalysis.insertMany(docs, { ordered: false });
        job.inserted += docs.length;
      } catch (err) {
        // Per-doc partial success: BulkWriteError carries .insertedCount and
        // an array of writeErrors. E11000 = duplicate website (expected).
        const insertedCount = err.result?.insertedCount ?? err.insertedDocs?.length ?? 0;
        const writeErrors = err.writeErrors || [];
        let dupCount = 0;
        let otherErrors = 0;
        for (const we of writeErrors) {
          if (we.err?.code === 11000 || we.code === 11000) dupCount++;
          else otherErrors++;
        }
        job.inserted += insertedCount;
        job.skipped += dupCount;
        job.errored += otherErrors;
      }
      job.processed += docs.length;
      job.lastProgressAt = new Date();
      await job.save();
    };

    for await (const doc of cursor) {
      buffer.push(doc);
      if (buffer.length >= WA_BATCH) await flush();
    }
    await flush();

    job.status = 'completed';
    job.completedAt = new Date();
    job.lastProgressAt = new Date();
    await job.save();
  } catch (err) {
    console.error('[website-analysis worker] Fatal:', err.message);
    try {
      job.status = 'error';
      job.errorMessage = err.message;
      job.lastProgressAt = new Date();
      await job.save();
    } catch (_) { /* ignore */ }
  }
}

// POST /api/admin/website-analysis/start — kick off (or report) a run
router.post('/website-analysis/start', async (_req, res) => {
  try {
    // Reap stale "running" jobs first — a crashed worker leaves the doc
    // marked running forever otherwise.
    const cutoff = new Date(Date.now() - WA_HEARTBEAT_STALE_MS);
    await WebsiteAnalysisJob.updateMany(
      { status: 'running', lastProgressAt: { $lt: cutoff } },
      { $set: { status: 'stopped', errorMessage: 'No heartbeat — worker died' } }
    );

    const active = await WebsiteAnalysisJob.findOne({ status: 'running' }).sort({ startedAt: -1 });
    if (active) {
      return res.status(200).json({
        success: true,
        alreadyRunning: true,
        message: 'A website-analysis job is already in progress',
        job: active,
      });
    }

    const job = await WebsiteAnalysisJob.create({
      status: 'queued',
      startedAt: new Date(),
      lastProgressAt: new Date(),
    });

    // Fire-and-forget — runs after the response is sent
    setImmediate(() => { runWebsiteAnalysisJob(job._id).catch(() => { /* logged inside */ }); });

    res.status(202).json({
      success: true,
      alreadyRunning: false,
      message: 'Website-analysis job started — check progress in the Website Analysis page',
      job,
    });
  } catch (err) {
    console.error('[website-analysis/start] Error:', err.message);
    res.status(500).json({ error: 'Server error', message: err.message });
  }
});

// GET /api/admin/website-analysis/jobs — paginated history
router.get('/website-analysis/jobs', async (req, res) => {
  try {
    const page  = Math.max(1, Number(req.query.page)  || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip  = (page - 1) * limit;

    const [data, total, archiveTotal] = await Promise.all([
      WebsiteAnalysisJob.find({}).sort({ startedAt: -1 }).skip(skip).limit(limit).lean(),
      WebsiteAnalysisJob.countDocuments({}),
      WebsiteAnalysis.estimatedDocumentCount(),
    ]);
    res.json({ data, total, page, limit, archiveTotal });
  } catch (err) {
    console.error('[website-analysis/jobs] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/website-analysis/jobs/:id — single job (used for polling)
router.get('/website-analysis/jobs/:id', async (req, res) => {
  try {
    const job = await WebsiteAnalysisJob.findById(req.params.id).lean();
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  } catch (err) {
    console.error('[website-analysis/jobs/:id] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/website-analysis/records — browse the deduped archive
router.get('/website-analysis/records', async (req, res) => {
  try {
    const { page = 1, limit = 25, search } = req.query;
    const filter = {};
    if (search) {
      const rx = { $regex: escapeRegex(String(search)), $options: 'i' };
      filter.$or = [
        { name: rx }, { website: rx }, { address: rx },
        { phone: rx }, { email: rx }, { category: rx },
      ];
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
      WebsiteAnalysis.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      WebsiteAnalysis.countDocuments(filter),
    ]);
    res.json({ data, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('[website-analysis/records] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
