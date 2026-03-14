require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const API_BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:5000';

/**
 * Timing values from the Settings UI screenshot.
 * All values are in milliseconds unless noted as "count".
 */
const SETTINGS = {
  // ── Timing ────────────────────────────────────────────────
  pageLoadTimeoutMs:     120000,  // Max wait for page navigation
  pageSettleDelayMs:       5000,  // Wait after page loads before scraping
  feedSelectorTimeoutMs:  60000,  // Max wait for feed/place to appear
  scrollDelayMs:           2000,  // Wait between scroll attempts
  noNewScrollRetries:         5,  // Retry count when no new items found (count)
  tabPageTimeoutMs:       30000,  // Max wait for each place detail page (tabs mode)
  clickWaitTimeoutMs:      8000,  // Max wait for URL change after click (feed mode)
  detailSettleDelayMs:      300,  // Buffer for detail panel fields to load
  betweenClicksDelayMs:     100,  // Delay between processing each feed item

  // ── Scraping mode ─────────────────────────────────────────
  scrapingMode: 'tabs',           // Open in New Tabs
  parallelTabs: 5,                // Number of parallel tabs
  batchSize:    10,               // Records before API call

  // ── Browser ───────────────────────────────────────────────
  headless: true,
};

const EXCEL_DIR = require('path').join(__dirname, '..', 'excel');

module.exports = { API_BASE_URL, SETTINGS, EXCEL_DIR };
