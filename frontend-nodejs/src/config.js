require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

// ── Resolve environment from APP_STATE in .env ───────────────────────────────
//
// The CLI talks to the backend over HTTP. Each environment has its own URL —
// `APP_STATE` selects which one is live. We went back to this architecture in
// v1.8.0 because the v1.6.0 DB-direct flow had every CLI process opening its
// own mongoose pool, and at 35+ devices that was hammering Mongo's CPU.
// One backend process pooling for everyone scales much better.
const APP_STATE = (process.env.APP_STATE || 'prod').toLowerCase();

const API_URLS = {
  local: process.env.LOCAL_API_URL,
  dev:   process.env.DEV_API_URL,
  prod:  process.env.PROD_API_URL,
};

const API_BASE_URL = API_URLS[APP_STATE];
if (!API_BASE_URL) {
  throw new Error(`Missing ${APP_STATE.toUpperCase()}_API_URL in .env`);
}

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
  // batchSize was 10 in v1.7.x; bumped to 100 in v1.8.1 so each device makes
  // ~10× fewer /batch round-trips at the same throughput. The backend dedup
  // query scales linearly with batch size but is indexed, so 100 conditions
  // is still cheap. Saves roughly 90% of the HTTP overhead at peak load.
  batchSize:    100,

  // ── Browser ───────────────────────────────────────────────
  headless: process.env.HEADLESS !== 'false',
};

module.exports = { API_BASE_URL, APP_STATE, SETTINGS };
