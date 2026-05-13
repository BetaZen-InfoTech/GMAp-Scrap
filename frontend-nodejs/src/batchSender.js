'use strict';

const ScrapedData = require('./models/ScrapedData');
const Device = require('./models/Device');
const { fixPhoneNumber } = require('./utils/phoneFixer');

/**
 * Duplicate keys from 5 fields.
 * Key 1: Phone + Rating + Reviews + Category + PlusCode
 * Key 2: Email + Rating + Reviews + Category + PlusCode
 */
function dupKeys(phone, email, rating, reviews, category, plusCode) {
  const keys = [];
  if (phone) keys.push(`P|${phone}|${rating || 0}|${reviews || 0}|${category || ''}|${plusCode || ''}`);
  if (email) keys.push(`E|${email}|${rating || 0}|${reviews || 0}|${category || ''}|${plusCode || ''}`);
  return keys;
}

/** Extract a 6-digit Indian pincode from an address string. */
function extractPincode(address) {
  if (!address) return null;
  const match = address.match(/\b(\d{6})\b/);
  return match ? match[1] : null;
}

/** Fire-and-forget: bump device's lastSeenAt + status */
function touchDevice(deviceId) {
  if (!deviceId) return;
  Device.updateOne(
    { deviceId },
    { $set: { lastSeenAt: new Date(), status: 'online' } }
  ).catch(() => { /* fire-and-forget */ });
}

/**
 * Persist a batch of scraped records directly to MongoDB, applying the same
 * duplicate-detection logic the backend used to do over HTTP. Mirrors the
 * old `POST /api/scraped-data/batch` route contract so callers don't change.
 */
async function sendBatch(records, batchNumber, sessionId, keyword, pincode, deviceId, scrapCategory, scrapSubCategory, round) {
  try {
    if (!Array.isArray(records) || records.length === 0) {
      return { success: false, fatal: true, batchNumber, count: 0, error: 'empty batch' };
    }

    touchDevice(deviceId);

    // Phone normalization in-place so dedup + storage use the same canonical value
    for (const r of records) {
      const { phone: fixedPhone, fixed } = fixPhoneNumber(r.phone);
      r.phone = fixedPhone;
      r._numberFixing = fixed;
    }

    // Duplicate detection — Phone+R+R+C+PC and Email+R+R+C+PC
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

    const newDocs = [];
    const dupDocs = [];
    for (const r of records) {
      const keys = dupKeys(r.phone, r.email, r.rating || 0, r.reviews || 0, r.category, r.plusCode);
      const isDup = keys.some((k) => existingKeys.has(k));
      const resolvedPincode = r.pincode || (pincode != null ? String(pincode) : null) || extractPincode(r.address) || undefined;

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
        scrapKeyword: keyword || undefined,
        scrapCategory: r.scrapCategory || scrapCategory || undefined,
        scrapSubCategory: r.scrapSubCategory || scrapSubCategory || undefined,
        scrapRound: round || undefined,
        scrapedAt: r.timestamp || new Date().toISOString(),
        scrapFrom: 'G-Map',
        numberFixing: r._numberFixing === true,
      };

      if (isDup) {
        doc.isDuplicate = true;
        dupDocs.push(doc);
      } else {
        for (const k of keys) existingKeys.add(k);
        doc.isDuplicate = false;
        newDocs.push(doc);
      }
    }

    const insertedIds = [];
    const duplicateIds = [];
    const allDocs = [...newDocs, ...dupDocs];

    if (allDocs.length > 0) {
      const inserted = await ScrapedData.insertMany(allDocs, { ordered: false });
      for (const d of inserted) {
        if (d.isDuplicate) duplicateIds.push(d._id);
        else insertedIds.push(d._id);
      }
    }

    return {
      success: true,
      batchNumber,
      count: newDocs.length,
      duplicateCount: dupDocs.length,
      totalReceived: records.length,
      insertedIds,
      duplicateIds,
    };
  } catch (err) {
    return {
      success: false,
      fatal: false,
      batchNumber,
      count: records?.length || 0,
      error: err.message,
    };
  }
}

module.exports = { sendBatch };
