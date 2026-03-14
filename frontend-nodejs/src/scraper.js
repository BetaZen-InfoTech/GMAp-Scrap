const { chromium } = require('playwright');
const fs = require('fs');

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractLatLng(url) {
  const match = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (match) {
    return { latitude: parseFloat(match[1]), longitude: parseFloat(match[2]) };
  }
  return {};
}

function detectNameVariants(name) {
  const hasNonLatin = /[^\u0000-\u024F\u1E00-\u1EFF]/.test(name);
  return hasNonLatin
    ? { nameEnglish: '', nameLocal: name }
    : { nameEnglish: name, nameLocal: '' };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── ScraperEngine ─────────────────────────────────────────────────────────────

/**
 * Playwright-based Google Maps scraper.
 * Scraping mode: TABS — Phase A collects all URLs, Phase B opens them in
 * parallel batches of `settings.parallelTabs` (default 5).
 *
 * Callbacks:
 *   onRecord(record)             — fired for every unique scraped record
 *   onProgress(totalScraped)     — fired after each record is emitted
 *   onUrlsCollected(totalUrls)   — fired once Phase A finishes
 *   onStatusChange(status, err)  — 'running' | 'completed' | 'error'
 *   onScrapError(url, name, err) — fired when a single place fails
 */
class ScraperEngine {
  constructor(sessionId, keyword, settings, callbacks) {
    this.sessionId    = sessionId;
    this.keyword      = keyword;
    this.settings     = settings;
    this.callbacks    = callbacks;

    this.browser      = null;
    this.context      = null;
    this.page         = null;
    this.running      = false;
    this.stopping     = false;
    this.seenKeys     = new Set();
    this.totalScraped = 0;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  async start() {
    this.running  = true;
    this.stopping = false;
    try {
      await this.launchBrowser();
      await this.scrapeGoogleMaps();
    } catch (err) {
      if (!this.stopping) {
        this.callbacks.onStatusChange('error', err.message);
      }
    } finally {
      await this.cleanup();
    }
  }

  async stop() {
    this.stopping = true;
    this.running  = false;
    await this.cleanup();
  }

  // ── Browser launch ──────────────────────────────────────────────────────────

  async launchBrowser() {
    let executablePath;

    // 1. Check if Playwright's bundled Chromium is installed
    let pwExecPath = null;
    try { pwExecPath = chromium.executablePath(); } catch { /* not yet installed */ }

    if (!pwExecPath || !fs.existsSync(pwExecPath)) {
      // 2. Try auto-install
      try {
        const { installBrowsersForNpmInstall } =
          require('playwright/lib/server/registry/index.js');
        await installBrowsersForNpmInstall(['chromium']);
        try { pwExecPath = chromium.executablePath(); } catch { /* still not found */ }
      } catch { /* auto-install not available */ }
    }

    if (!pwExecPath || !fs.existsSync(pwExecPath)) {
      // 3. Fall back to system Microsoft Edge (pre-installed on Windows 10/11)
      const edgeCandidates = [
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      ];
      const edgePath = edgeCandidates.find((p) => fs.existsSync(p));
      if (edgePath) {
        executablePath = edgePath;
      } else {
        throw new Error(
          'Chromium not installed and Edge not found.\n' +
          'Run once:  npm run install-browser'
        );
      }
    }

    this.browser = await chromium.launch({
      headless:       this.settings.headless ?? true,
      executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    this.context = await this.browser.newContext({
      viewport:  { width: 1280, height: 900 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
                 '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    this.page = await this.context.newPage();
  }

  // ── Main scrape flow ────────────────────────────────────────────────────────

  async scrapeGoogleMaps() {
    if (!this.page) throw new Error('Browser page not initialised');

    this.callbacks.onStatusChange('running');

    const searchUrl = this.keyword.startsWith('http')
      ? this.keyword
      : `https://www.google.com/maps/search/${encodeURIComponent(this.keyword)}`;

    await this.page.goto(searchUrl, {
      waitUntil: 'domcontentloaded',
      timeout:   this.settings.pageLoadTimeoutMs,
    });

    // Let the page fully settle before any interaction
    await this.page.waitForTimeout(this.settings.pageSettleDelayMs);

    await this.page
      .waitForSelector('[role="feed"], h1.DUwDvf', {
        timeout: this.settings.feedSelectorTimeoutMs,
      })
      .catch(() => null);

    const currentUrl  = this.page.url();
    const hasFeed     = await this.page.$('[role="feed"]');
    const isSinglePlace = currentUrl.includes('/maps/place/') || !hasFeed;

    if (isSinglePlace) {
      const record = await this.extractFromDetailPage();
      if (record) this.maybeEmitRecord(record);
      if (!this.stopping) this.callbacks.onStatusChange('completed');
      return;
    }

    await this.scrollAndExtractTabs();

    if (!this.stopping) this.callbacks.onStatusChange('completed');
  }

  // ── TABS MODE ───────────────────────────────────────────────────────────────

  async scrollAndExtractTabs() {
    if (!this.page || !this.context) return;

    const hasFeed = await this.page.$('[role="feed"]');
    if (!hasFeed) return;

    // Phase A — scroll to end and gather every place URL
    const allUrls = await this.collectAllFeedUrls();
    if (allUrls.length === 0 || !this.running || this.stopping) return;

    if (this.callbacks.onUrlsCollected) {
      this.callbacks.onUrlsCollected(allUrls.length);
    }

    // Phase B — open in parallel batches
    const tabBatchSize = Math.max(1, Math.min(this.settings.parallelTabs ?? 5, 100));

    for (let i = 0; i < allUrls.length && this.running && !this.stopping; i += tabBatchSize) {
      const batch = allUrls.slice(i, i + tabBatchSize);

      // Open all tabs simultaneously
      const tabs = await Promise.all(
        batch.map(async (url) => {
          const tab = await this.context.newPage();
          await tab
            .goto(url, {
              waitUntil: 'domcontentloaded',
              timeout:   this.settings.tabPageTimeoutMs,
            })
            .catch(() => null);
          return tab;
        })
      );

      // Extract from all tabs in parallel
      const records = await Promise.all(
        tabs.map((tab, idx) => this.extractFromPage(tab, batch[idx]))
      );

      // Close all tabs
      await Promise.all(tabs.map((tab) => tab.close().catch(() => null)));

      // Emit unique records
      for (const record of records) {
        if (record && this.running && !this.stopping) {
          this.maybeEmitRecord(record);
        }
      }
    }
  }

  /**
   * Auto-scroll the feed panel until no new URLs appear (or end-of-list
   * indicator is detected), then return the full collection.
   */
  async collectAllFeedUrls() {
    if (!this.page) return [];

    const collected    = new Set();
    let noNewCount     = 0;
    let lastScrollHeight = 0;

    while (this.running && !this.stopping) {
      const links = await this.page
        .$$eval(
          '[role="feed"] a[href*="/maps/place/"]',
          (els) => els.map((el) => el.href).filter(Boolean)
        )
        .catch(() => []);

      const prevSize = collected.size;
      links.forEach((url) => collected.add(url));

      // Google Maps end-of-results indicator
      const endOfList = await this.page.$('span.HlvSq');
      if (endOfList) break;

      // Scroll feed down
      const feed = await this.page.$('[role="feed"]');
      if (feed) {
        await this.page.evaluate((el) => { el.scrollBy(0, el.scrollHeight); }, feed);
      }
      await this.page.waitForTimeout(this.settings.scrollDelayMs);

      const newScrollHeight = await this.page
        .evaluate(() => {
          const f = document.querySelector('[role="feed"]');
          return f ? f.scrollHeight : 0;
        })
        .catch(() => 0);

      const noNewUrls   = collected.size === prevSize;
      const noNewScroll = newScrollHeight === lastScrollHeight;

      if (noNewUrls && noNewScroll) {
        noNewCount++;
        if (noNewCount >= this.settings.noNewScrollRetries) break;
      } else {
        noNewCount = 0;
      }
      lastScrollHeight = newScrollHeight;
    }

    return Array.from(collected);
  }

  // ── Deduplication ───────────────────────────────────────────────────────────

  maybeEmitRecord(record) {
    const key =
      record.name.toLowerCase().replace(/\s+/g, ' ') + '|||' +
      record.address.toLowerCase().replace(/\s+/g, ' ').substring(0, 80);

    if (!this.seenKeys.has(key)) {
      this.seenKeys.add(key);
      this.totalScraped++;
      this.callbacks.onRecord(record);
      this.callbacks.onProgress(this.totalScraped);
    }
  }

  // ── Data extraction ─────────────────────────────────────────────────────────

  async extractFromDetailPage() {
    if (!this.page) return null;
    await this.page.waitForSelector('h1.DUwDvf', { timeout: 8000 }).catch(() => null);
    return this.extractFromPage(this.page, this.page.url());
  }

  /**
   * Extract all place data from an already-navigated page.
   * Returns null if the place name cannot be found.
   */
  async extractFromPage(tab, mapsUrl) {
    let partialName;
    try {
      await tab.waitForSelector('h1.DUwDvf', { timeout: 10000 }).catch(() => null);

      const name = await tab
        .$eval(
          'h1.DUwDvf, [data-section-id="ap"] .rogA2c',
          (el) => el.textContent?.trim() || ''
        )
        .catch(() => '');

      if (!name) return null;
      partialName = name;

      const address = await tab
        .$eval(
          '[data-item-id="address"] .Io6YTe, button[data-item-id="address"] .Io6YTe',
          (el) => el.textContent?.trim() || ''
        )
        .catch(() => '');

      const phone = await tab
        .$eval(
          '[data-item-id*="phone"] .Io6YTe, [data-tooltip="Copy phone number"] .Io6YTe',
          (el) => el.textContent?.trim() || ''
        )
        .catch(() => '');

      const email = await tab
        .$eval('a[href^="mailto:"]', (el) => el.href.replace('mailto:', '').trim())
        .catch(() => '');

      const website = await tab
        .$eval(
          '[data-item-id*="authority"] .Io6YTe, a[data-item-id*="authority"]',
          (el) => el.textContent?.trim() || ''
        )
        .catch(() => '');

      const ratingText = await tab
        .$eval(
          '.F7nice span[aria-hidden="true"], div.F7nice span',
          (el) => el.textContent?.trim() || '0'
        )
        .catch(() => '0');
      const rating = parseFloat(ratingText.replace(',', '.')) || 0;

      const reviewsText = await tab
        .$eval(
          '.F7nice span[aria-label*="review"], .UY7F9 span',
          (el) => {
            const label = el.getAttribute('aria-label') || el.textContent || '0';
            return label.replace(/[^0-9,]/g, '').replace(',', '');
          }
        )
        .catch(() => '0');
      const reviews = parseInt(reviewsText, 10) || 0;

      const category = await tab
        .$eval(
          'button.DkEaL, [jsaction*="category"] .DkEaL',
          (el) => el.textContent?.trim() || ''
        )
        .catch(() => '');

      const plusCode = await tab
        .$eval(
          '[data-item-id*="plus_code"] .Io6YTe, [data-tooltip="Copy plus code"] .Io6YTe, [aria-label*="Plus code"] .Io6YTe',
          (el) => el.textContent?.trim() || ''
        )
        .catch(() => '');

      const photoUrl = await tab
        .$eval(
          'button.aoRNLd img, .RZ66Rb img, .XZgiqe img',
          (el) => el.src || ''
        )
        .catch(() => '');

      const finalUrl = tab.url() || mapsUrl;
      const { nameEnglish, nameLocal } = detectNameVariants(name);
      const { latitude, longitude }    = extractLatLng(finalUrl);

      return {
        sessionId:    this.sessionId,
        name,
        nameEnglish:  nameEnglish || undefined,
        nameLocal:    nameLocal   || undefined,
        address,
        phone,
        email:        email    || undefined,
        website,
        rating,
        reviews,
        category,
        plusCode:     plusCode  || undefined,
        photoUrl:     photoUrl  || undefined,
        latitude,
        longitude,
        mapsUrl:      finalUrl,
        timestamp:    new Date().toISOString(),
      };
    } catch (err) {
      if (this.callbacks.onScrapError) {
        this.callbacks.onScrapError(mapsUrl, partialName, err.message);
      }
      return null;
    }
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────────

  async cleanup() {
    try {
      if (this.page)    { await this.page.close().catch(() => null);    this.page    = null; }
      if (this.context) { await this.context.close().catch(() => null); this.context = null; }
      if (this.browser) { await this.browser.close().catch(() => null); this.browser = null; }
    } catch { /* ignore cleanup errors */ }
  }
}

module.exports = { ScraperEngine };
