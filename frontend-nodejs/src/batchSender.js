const axios = require('axios');
const { API_BASE_URL } = require('./config');

const RETRY_DELAYS = [1000, 2000, 4000];

/** HTTP status codes where retrying the request is pointless. */
function isFatalStatus(status) {
  return status === 400 || status === 401 || status === 403 || status === 404 || status === 413 || status === 422;
}

/**
 * Send a batch of scraped records to the backend.
 * Retries up to 3 times with exponential back-off on transient failures.
 * Returns { success, fatal, ... } — `fatal: true` means retries would not help
 * (auth / validation / permanently rejected) and the caller should stop
 * re-queueing this batch.
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
      const status = err.response?.status;
      // Fatal statuses — retrying won't help. Bail immediately and flag.
      if (status && isFatalStatus(status)) {
        return {
          success: false,
          fatal: true,
          batchNumber,
          count: records.length,
          status,
          error: `HTTP ${status}: ${err.response?.data?.error || err.message}`,
        };
      }
      const isLast = attempt === RETRY_DELAYS.length;
      if (isLast) {
        return { success: false, fatal: false, batchNumber, count: records.length, status, error: err.message };
      }
      await sleep(RETRY_DELAYS[attempt]);
    }
  }

  return { success: false, fatal: false, batchNumber, count: records.length, error: 'Max retries reached' };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { sendBatch };
