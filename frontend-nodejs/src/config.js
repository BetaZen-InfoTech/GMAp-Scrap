require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

// ── Resolve environment from APP_STATE in .env ───────────────────────────────
const APP_STATE = (process.env.APP_STATE || 'prod').toLowerCase();

const MONGO_URIS = {
  local: process.env.LOCAL_MONGODB_URI,
  dev:   process.env.DEV_MONGODB_URI,
  prod:  process.env.PROD_MONGODB_URI,
};

const MONGODB_URI = MONGO_URIS[APP_STATE];
if (!MONGODB_URI) {
  throw new Error(`Missing ${APP_STATE.toUpperCase()}_MONGODB_URI in .env`);
}

/**
 * Timing values from the Settings UI screenshot.
 * All values are in milliseconds unless noted as "count".
 */
const SETTINGS = {
  // ── Timing ────────────────────────────────────────────────
  pageLoadTimeoutMs:     120000,
  pageSettleDelayMs:       5000,
  feedSelectorTimeoutMs:  60000,
  scrollDelayMs:           2000,
  noNewScrollRetries:         5,
  tabPageTimeoutMs:       30000,
  clickWaitTimeoutMs:      8000,
  detailSettleDelayMs:      300,
  betweenClicksDelayMs:     100,

  // ── Scraping mode ─────────────────────────────────────────
  scrapingMode: 'tabs',
  parallelTabs: 5,
  batchSize:    10,

  // ── Browser ───────────────────────────────────────────────
  headless: process.env.HEADLESS !== 'false',
};

module.exports = { MONGODB_URI, APP_STATE, SETTINGS };
