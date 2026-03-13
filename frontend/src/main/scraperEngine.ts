import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { ScrapedRecord, SessionStatus, AppSettings } from '../shared/types';

export interface ScraperCallbacks {
  onRecord: (record: ScrapedRecord) => void;
  onStatusChange: (status: SessionStatus, error?: string) => void;
  onProgress: (totalScraped: number) => void;
  onScrapError: (url: string, name: string | undefined, error: string) => void;
  /** Called once in tabs mode after Phase A (URL collection) is done */
  onUrlsCollected?: (totalUrls: number) => void;
}

/** Extract latitude and longitude from a Google Maps URL */
function extractLatLng(url: string): { latitude?: number; longitude?: number } {
  const match = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (match) {
    return { latitude: parseFloat(match[1]), longitude: parseFloat(match[2]) };
  }
  return {};
}

/** Detect if a name contains non-Latin characters (local language) */
function detectNameVariants(name: string): { nameEnglish: string; nameLocal: string } {
  const hasNonLatin = /[^\u0000-\u024F\u1E00-\u1EFF]/.test(name);
  if (hasNonLatin) {
    return { nameEnglish: '', nameLocal: name };
  }
  return { nameEnglish: name, nameLocal: '' };
}

export class ScraperEngine {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private running = false;
  private stopping = false;
  private seenKeys = new Set<string>();
  private sessionId: string;
  private keyword: string;
  private settings: AppSettings;
  private callbacks: ScraperCallbacks;
  private totalScraped = 0;

  constructor(
    sessionId: string,
    keyword: string,
    settings: AppSettings,
    callbacks: ScraperCallbacks
  ) {
    this.sessionId = sessionId;
    this.keyword = keyword;
    this.settings = settings;
    this.callbacks = callbacks;
  }

  async start(): Promise<void> {
    this.running = true;
    this.stopping = false;

    try {
      await this.launchBrowser();
      await this.scrapeGoogleMaps();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (!this.stopping) {
        this.callbacks.onStatusChange('error', message);
      }
    } finally {
      await this.cleanup();
    }
  }

  async stop(): Promise<void> {
    this.stopping = true;
    this.running = false;
    await this.cleanup();
  }

  /** Returns the path to a system Edge install, or null if not found. */
  private findSystemEdge(): string | null {
    const candidates = [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    ];
    const { existsSync } = require('fs') as typeof import('fs');
    return candidates.find((p) => existsSync(p)) ?? null;
  }

  /** Tries to auto-install Playwright Chromium; returns true on success. */
  private async tryAutoInstallChromium(): Promise<boolean> {
    try {
      // Use playwright-core's internal install helper (avoids ASAR/CLI issues)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { installBrowsersForNpmInstall } = require('playwright-core/lib/server/registry/index.js') as {
        installBrowsersForNpmInstall: (browsers: string[]) => Promise<boolean>;
      };
      await installBrowsersForNpmInstall(['chromium']);
      return true;
    } catch {
      return false;
    }
  }

  private async launchBrowser(): Promise<void> {
    const headless = this.settings.headless ?? false;
    const browser = this.settings.browser ?? 'chromium';

    if (browser === 'chromium') {
      const { existsSync } = await import('fs');
      let executablePath: string | undefined;

      // Check if Playwright's bundled Chromium is available
      let pwExecPath: string | null = null;
      try { pwExecPath = chromium.executablePath(); } catch { /* not installed */ }

      if (!pwExecPath || !existsSync(pwExecPath)) {
        // 1. Try auto-installing (works in dev; no-op if path is read-only in packaged app)
        await this.tryAutoInstallChromium();

        // Re-check after install attempt
        try { pwExecPath = chromium.executablePath(); } catch { /* still not found */ }

        if (!pwExecPath || !existsSync(pwExecPath)) {
          // 2. Fall back to system Edge (pre-installed on every Windows 10/11 device)
          const edge = this.findSystemEdge();
          if (edge) {
            executablePath = edge;
          } else {
            throw new Error(
              'Playwright Chromium browser is not installed, and Microsoft Edge was not found.\n\n' +
              'To fix this, run once:\n  npx playwright install chromium\n\n' +
              'Or go to Settings → Browser → select "Microsoft Edge".'
            );
          }
        }
      }

      this.browser = await chromium.launch({
        headless,
        executablePath,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    } else if (browser === 'brave') {
      const { existsSync } = await import('fs');
      if (!existsSync(this.settings.braveExecutablePath)) {
        throw new Error(
          `Brave executable not found: "${this.settings.braveExecutablePath}". ` +
          `Please update the Brave path in Settings or switch to Chromium.`
        );
      }
      this.browser = await chromium.launch({
        headless,
        executablePath: this.settings.braveExecutablePath,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    } else {
      // Edge
      const { existsSync } = await import('fs');
      const edgePath = this.settings.edgeExecutablePath ||
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
      if (!existsSync(edgePath)) {
        throw new Error(
          `Microsoft Edge executable not found: "${edgePath}". ` +
          `Please update the Edge path in Settings or switch to Chromium.`
        );
      }
      this.browser = await chromium.launch({
        headless,
        executablePath: edgePath,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }

    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    this.page = await this.context.newPage();
  }

  private async scrapeGoogleMaps(): Promise<void> {
    if (!this.page) throw new Error('Browser page not initialized');

    this.callbacks.onStatusChange('running');

    const searchUrl = this.keyword.startsWith('http')
      ? this.keyword
      : `https://www.google.com/maps/search/${encodeURIComponent(this.keyword)}`;

    await this.page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: this.settings.pageLoadTimeoutMs });

    // Wait for page to fully settle before interacting
    await this.page.waitForTimeout(this.settings.pageSettleDelayMs);

    await this.page.waitForSelector('[role="feed"], h1.DUwDvf', { timeout: this.settings.feedSelectorTimeoutMs }).catch(() => null);

    const currentUrl = this.page.url();
    const isSinglePlace = currentUrl.includes('/maps/place/') || !(await this.page.$('[role="feed"]'));

    if (isSinglePlace) {
      const record = await this.extractFromDetailPage();
      if (record) {
        this.totalScraped++;
        this.callbacks.onRecord(record);
        this.callbacks.onProgress(this.totalScraped);
      }
      if (!this.stopping) this.callbacks.onStatusChange('completed');
      return;
    }

    let hasMore = true;

    while (hasMore && this.running && !this.stopping) {
      await this.scrollAndExtract();

      const nextBtn = await this.page.$('button[aria-label="Next page"]');
      if (nextBtn) {
        const isDisabled = await nextBtn.getAttribute('disabled');
        if (!isDisabled) {
          await nextBtn.click();
          await this.page.waitForTimeout(2000);
          await this.page.waitForSelector('[role="feed"]', { timeout: 10000 }).catch(() => null);
        } else {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    }

    if (!this.stopping) this.callbacks.onStatusChange('completed');
  }

  // ─────────────────────────────────────────────────────────
  //  Route to the selected scraping mode
  // ─────────────────────────────────────────────────────────

  private async scrollAndExtract(): Promise<void> {
    if (this.settings.scrapingMode === 'feed') {
      await this.scrollAndExtractFeed();
    } else {
      await this.scrollAndExtractTabs();
    }
  }

  // ─────────────────────────────────────────────────────────
  //  MODE 1 — TABS
  //  Phase A: Auto-scroll feed to the end, collecting all URLs.
  //  Phase B: Open URLs in parallel batches of parallelTabs tabs.
  // ─────────────────────────────────────────────────────────

  private async scrollAndExtractTabs(): Promise<void> {
    if (!this.page || !this.context) return;

    const hasFeed = await this.page.$('[role="feed"]');
    if (!hasFeed) return;

    // ── Phase A: Scroll to end and collect ALL place URLs ──
    const allUrls = await this.collectAllFeedUrls();
    if (allUrls.length === 0 || !this.running || this.stopping) return;

    // Notify that URL collection is done so the UI can show Total / Due stats
    this.callbacks.onUrlsCollected?.(allUrls.length);

    // ── Phase B: Open in parallel batches of parallelTabs ──
    const batchSize = Math.max(1, Math.min(this.settings.parallelTabs ?? 5, 100));

    for (let i = 0; i < allUrls.length && this.running && !this.stopping; i += batchSize) {
      const batch = allUrls.slice(i, i + batchSize);

      // Step 1: Open all tabs in the batch simultaneously
      const tabs = await Promise.all(
        batch.map(async (url) => {
          const tab = await this.context!.newPage();
          await tab.goto(url, { waitUntil: 'domcontentloaded', timeout: this.settings.tabPageTimeoutMs }).catch(() => null);
          return tab;
        })
      );

      // Step 2: Extract data from all tabs in parallel
      const records = await Promise.all(
        tabs.map((tab, idx) => this.extractFromPage(tab, batch[idx]))
      );

      // Step 3: Close all tabs
      await Promise.all(tabs.map((tab) => tab.close().catch(() => null)));

      // Step 4: Save unique records
      for (let j = 0; j < batch.length; j++) {
        const record = records[j];
        if (record && this.running && !this.stopping) {
          this.maybeEmitRecord(record);
        }
      }
    }
  }

  /**
   * Auto-scroll the feed panel until no new URLs appear, then return all collected URLs.
   */
  private async collectAllFeedUrls(): Promise<string[]> {
    if (!this.page) return [];

    const collected = new Set<string>();
    let noNewCount = 0;
    let lastScrollHeight = 0;

    while (this.running && !this.stopping) {
      const links = await this.page.$$eval(
        '[role="feed"] a[href*="/maps/place/"]',
        (els) => els.map((el) => (el as HTMLAnchorElement).href).filter(Boolean)
      ).catch((): string[] => []);

      const prevSize = collected.size;
      links.forEach((url) => collected.add(url));

      // Check for Google Maps' end-of-results indicator
      const endOfList = await this.page.$('span.HlvSq');
      if (endOfList) break;

      // Scroll the feed down by its full scrollHeight
      const feed = await this.page.$('[role="feed"]');
      if (feed) {
        await this.page.evaluate((el) => { el.scrollBy(0, el.scrollHeight); }, feed);
      }
      await this.page.waitForTimeout(this.settings.scrollDelayMs);

      // Check both URL count AND scrollHeight to detect end of feed
      const newScrollHeight = await this.page.evaluate(() => {
        const f = document.querySelector('[role="feed"]');
        return f ? f.scrollHeight : 0;
      }).catch(() => 0);

      const noNewUrls = collected.size === prevSize;
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

  // ─────────────────────────────────────────────────────────
  //  MODE 2 — FEED CLICK
  //  Track items by their URL (href), not by DOM index.
  //  After each click Google Maps may re-render/reorder the
  //  feed, so index-based tracking silently skips items.
  // ─────────────────────────────────────────────────────────

  private async scrollAndExtractFeed(): Promise<void> {
    if (!this.page) return;

    const hasFeed = await this.page.$('[role="feed"]');
    if (!hasFeed) return;

    // Track which place URLs have already been processed
    const processedUrls = new Set<string>();
    let noNewCount = 0;
    let lastScrollHeight = 0;

    while (this.running && !this.stopping) {
      // Collect all hrefs currently visible in the feed
      const allHrefs = await this.page.$$eval(
        '[role="feed"] a[href*="/maps/place/"]',
        (els) => els.map((el) => (el as HTMLAnchorElement).href).filter(Boolean)
      ).catch((): string[] => []);

      const newHrefs = allHrefs.filter((h) => !processedUrls.has(h));

      // Click and extract each unprocessed item, found by its href (not by index)
      for (const href of newHrefs) {
        if (!this.running || this.stopping) break;

        try {
          // Locate the element whose absolute href matches — re-evaluated each time
          // so index shifts after clicks never cause the wrong item to be clicked.
          const handle = await this.page.evaluateHandle(
            (targetHref: string) => {
              const items = document.querySelectorAll('[role="feed"] a[href*="/maps/place/"]');
              return (Array.from(items) as HTMLAnchorElement[]).find(
                (el) => el.href === targetHref
              ) ?? null;
            },
            href
          );
          const element = handle.asElement();

          if (!element) {
            // Item virtualized out of DOM — scroll will bring it back; retry next round
            continue;
          }

          const record = await this.extractListing(element);
          if (record) this.maybeEmitRecord(record);
        } catch {
          // Skip on error — already reported via onScrapError inside extractListing
        }

        // Mark as processed only AFTER attempting (so virtualised items get retried)
        processedUrls.add(href);
        await this.page.waitForTimeout(this.settings.betweenClicksDelayMs);
      }

      // Check for Google Maps' end-of-results indicator
      const endOfList = await this.page.$('span.HlvSq');
      if (endOfList) break;

      // Scroll the feed down by its full scrollHeight
      const feed = await this.page.$('[role="feed"]');
      if (feed) {
        await this.page.evaluate((el) => { el.scrollBy(0, el.scrollHeight); }, feed);
      }
      await this.page.waitForTimeout(this.settings.scrollDelayMs);

      // Check both URL count AND scrollHeight to detect end of feed
      const newScrollHeight = await this.page.evaluate(() => {
        const f = document.querySelector('[role="feed"]');
        return f ? f.scrollHeight : 0;
      }).catch(() => 0);

      const noNewScroll = newScrollHeight === lastScrollHeight;

      if (newHrefs.length === 0 && noNewScroll) {
        noNewCount++;
        if (noNewCount >= this.settings.noNewScrollRetries) break;
      } else {
        noNewCount = 0;
      }
      lastScrollHeight = newScrollHeight;
    }
  }

  // ─────────────────────────────────────────────────────────
  //  Deduplication helper
  // ─────────────────────────────────────────────────────────

  private maybeEmitRecord(record: ScrapedRecord): void {
    const key =
      `${record.name.toLowerCase().replace(/\s+/g, ' ')}|||` +
      `${record.address.toLowerCase().replace(/\s+/g, ' ').substring(0, 80)}`;
    if (!this.seenKeys.has(key)) {
      this.seenKeys.add(key);
      this.totalScraped++;
      this.callbacks.onRecord(record);
      this.callbacks.onProgress(this.totalScraped);
    }
  }

  // ─────────────────────────────────────────────────────────
  //  Extraction helpers
  // ─────────────────────────────────────────────────────────

  /** Extract from the current main page (single-place or feed-click mode) */
  private async extractFromDetailPage(): Promise<ScrapedRecord | null> {
    if (!this.page) return null;
    await this.page.waitForSelector('h1.DUwDvf', { timeout: 8000 }).catch(() => null);
    return this.extractFromPage(this.page, this.page.url());
  }

  /** Feed-click mode: click one listing, wait for its detail panel, then extract */
  private async extractListing(element: import('playwright').ElementHandle): Promise<ScrapedRecord | null> {
    if (!this.page) return null;

    try {
      const prevUrl = this.page.url();
      const prevName = await this.page.$eval(
        'h1.DUwDvf',
        (el) => el.textContent?.trim() || ''
      ).catch(() => '');

      // Scroll into view so the click lands correctly
      await element.scrollIntoViewIfNeeded().catch(() => null);
      await element.click();

      // Phase 1: Wait for URL change
      try {
        await this.page.waitForFunction(
          (pUrl: string) => window.location.href !== pUrl,
          prevUrl,
          { timeout: this.settings.clickWaitTimeoutMs }
        );
      } catch {
        await this.page.waitForTimeout(2500);
      }

      // Phase 2: Check name immediately — loop every 200 ms until name changes
      let domReady = false;
      for (let poll = 0; poll < 10 && !domReady && this.running && !this.stopping; poll++) {
        const curName = await this.page.evaluate(
          () => (document.querySelector('h1.DUwDvf') as HTMLElement | null)?.textContent?.trim() ?? ''
        ).catch(() => '');

        if (curName !== '' && curName !== prevName) {
          domReady = true;
        } else {
          await this.page.waitForTimeout(200);
        }
      }

      // Small buffer for remaining fields to settle
      await this.page.waitForTimeout(this.settings.detailSettleDelayMs);
      await this.page.waitForSelector('h1.DUwDvf', { timeout: 5000 }).catch(() => null);

      return this.extractFromPage(this.page, this.page.url());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.callbacks.onScrapError(this.page?.url() ?? 'unknown', undefined, message);
      return null;
    }
  }

  /**
   * Extract all place data from an already-navigated page.
   * Used by both tab mode and feed-click mode.
   * On failure, fires onScrapError with the URL + error message and returns null.
   */
  private async extractFromPage(tab: Page, mapsUrl: string): Promise<ScrapedRecord | null> {
    let partialName: string | undefined;
    try {
      await tab.waitForSelector('h1.DUwDvf', { timeout: 10000 }).catch(() => null);

      const name = await tab.$eval(
        'h1.DUwDvf, [data-section-id="ap"] .rogA2c',
        (el) => el.textContent?.trim() || ''
      ).catch(() => '');

      if (!name) {
        this.callbacks.onScrapError(mapsUrl, undefined, 'Place name not found on page');
        return null;
      }
      partialName = name;

      const address = await tab.$eval(
        '[data-item-id="address"] .Io6YTe, button[data-item-id="address"] .Io6YTe',
        (el) => el.textContent?.trim() || ''
      ).catch(() => '');

      const phone = await tab.$eval(
        '[data-item-id*="phone"] .Io6YTe, [data-tooltip="Copy phone number"] .Io6YTe',
        (el) => el.textContent?.trim() || ''
      ).catch(() => '');

      const email = await tab.$eval(
        'a[href^="mailto:"]',
        (el) => (el as HTMLAnchorElement).href.replace('mailto:', '').trim()
      ).catch(() => '');

      const website = await tab.$eval(
        '[data-item-id*="authority"] .Io6YTe, a[data-item-id*="authority"]',
        (el) => el.textContent?.trim() || ''
      ).catch(() => '');

      const ratingText = await tab.$eval(
        '.F7nice span[aria-hidden="true"], div.F7nice span',
        (el) => el.textContent?.trim() || '0'
      ).catch(() => '0');
      const rating = parseFloat(ratingText.replace(',', '.')) || 0;

      const reviewsText = await tab.$eval(
        '.F7nice span[aria-label*="review"], .UY7F9 span',
        (el) => {
          const label = el.getAttribute('aria-label') || el.textContent || '0';
          return label.replace(/[^0-9,]/g, '').replace(',', '');
        }
      ).catch(() => '0');
      const reviews = parseInt(reviewsText, 10) || 0;

      const category = await tab.$eval(
        'button.DkEaL, [jsaction*="category"] .DkEaL',
        (el) => el.textContent?.trim() || ''
      ).catch(() => '');

      const plusCode = await tab.$eval(
        '[data-item-id*="plus_code"] .Io6YTe, [data-tooltip="Copy plus code"] .Io6YTe, [aria-label*="Plus code"] .Io6YTe',
        (el) => el.textContent?.trim() || ''
      ).catch(() => '');

      const photoUrl = await tab.$eval(
        'button.aoRNLd img, .RZ66Rb img, .XZgiqe img',
        (el) => (el as HTMLImageElement).src || ''
      ).catch(() => '');

      const finalUrl = tab.url() || mapsUrl;
      const { nameEnglish, nameLocal } = detectNameVariants(name);
      const { latitude, longitude } = extractLatLng(finalUrl);

      return {
        sessionId: this.sessionId,
        name,
        nameEnglish: nameEnglish || undefined,
        nameLocal: nameLocal || undefined,
        address,
        phone,
        email: email || undefined,
        website,
        rating,
        reviews,
        category,
        plusCode: plusCode || undefined,
        photoUrl: photoUrl || undefined,
        latitude,
        longitude,
        mapsUrl: finalUrl,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.callbacks.onScrapError(mapsUrl, partialName, message);
      return null;
    }
  }

  private async cleanup(): Promise<void> {
    try {
      if (this.page) {
        await this.page.close().catch(() => null);
        this.page = null;
      }
      if (this.context) {
        await this.context.close().catch(() => null);
        this.context = null;
      }
      if (this.browser) {
        await this.browser.close().catch(() => null);
        this.browser = null;
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}
