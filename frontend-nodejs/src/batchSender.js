const axios = require('axios');
const { API_BASE_URL } = require('./config');

const RETRY_DELAYS = [1000, 2000, 4000];

/**
 * Send a batch of scraped records to the backend.
 * Retries up to 3 times with exponential back-off.
 */
async function sendBatch(records, batchNumber, sessionId, keyword, pincode, deviceId, scrapCategory, scrapSubCategory, round) {
  const endpoint = `${API_BASE_URL}/api/scraped-data/batch`;

  const payload = {
    batchNumber,
    timestamp: new Date().toISOString(),
    sessionId,
    deviceId:  deviceId || undefined,
    count: records.length,
    pincode: pincode != null ? String(pincode) : undefined,
    keyword,
    scrapCategory:    scrapCategory || undefined,
    scrapSubCategory: scrapSubCategory || undefined,
    round:            round || undefined,
    scrapFrom:        'G-Map',
    records,
  };

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const res = await axios.post(endpoint, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000,
      });

      return {
        success: true,
        batchNumber,
        count:          res.data?.count          ?? records.length,
        duplicateCount: res.data?.duplicateCount ?? 0,
        insertedIds:    res.data?.insertedIds    ?? [],
        duplicateIds:   res.data?.duplicateIds   ?? [],
      };
    } catch (err) {
      const isLast = attempt === RETRY_DELAYS.length;
      if (isLast) {
        return { success: false, batchNumber, count: records.length, error: err.message };
      }
      await sleep(RETRY_DELAYS[attempt]);
    }
  }

  return { success: false, batchNumber, count: records.length, error: 'Max retries reached' };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { sendBatch };
