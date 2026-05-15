'use strict';

/**
 * Website Scraper — visit each website, harvest contact info.
 *
 * Strategy (per site):
 *   1. Load homepage with Playwright (default 12s timeout, headless OK)
 *   2. Extract emails / phones / contact-name candidates from rendered HTML
 *      and from any mailto: / tel: links
 *   3. If nothing found on the homepage, hop to the first /contact, /about,
 *      /reach, /contact-us path that exists (one shallow hop only — full crawls
 *      are out of scope for a per-batch budget of a few seconds per site)
 *   4. Return a deduped list of (email, phone, contactName) tuples
 *
 * The caller decides what to do with the result (insert into Scraped-Data,
 * mark the source row scrapWebsite=true, etc.).
 */

const { chromium } = require('playwright');

// ── Regexes ───────────────────────────────────────────────────────────────────

// RFC-ish — good enough for harvesting from page text. We over-match a bit and
// the per-record filtering below removes obvious junk.
const EMAIL_RX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

// Indian-leaning phone matcher — captures local +91 numbers, 10-digit mobiles,
// landlines with city codes, and STD/ISD variants with spaces / dashes /
// parens. The CLI's existing phoneFixer.js normalizes whatever this matches.
const PHONE_RX = /(?:(?:\+91|91)[ \-]?)?(?:\(?\d{2,5}\)?[ \-]?)?\d{3,4}[ \-]?\d{3,4}\b/g;

// Obvious garbage we skip after the regex pass.
const EMAIL_BLACKLIST_DOMAINS = new Set([
  'example.com', 'example.org', 'example.net', 'domain.com', 'email.com',
  'sentry.io', 'wixpress.com', 'wix.com', 'godaddy.com', 'cloudflare.com',
]);

// Phone patterns that are almost always noise. Filtering by length first.
function isLikelyPhone(raw) {
  const digits = String(raw).replace(/\D/g, '');
  // 10 digits (Indian mobile) or 11–13 (with country/STD code) is sane.
  // < 7 digits is too short to be a phone. > 13 is usually a SKU / order id.
  return digits.length >= 7 && digits.length <= 13;
}

function isLikelyEmail(raw) {
  const lower = String(raw).toLowerCase();
  if (lower.length > 80) return false;
  // Strip the bit after @ and check against our blacklist.
  const domain = lower.split('@')[1];
  if (!domain) return false;
  if (EMAIL_BLACKLIST_DOMAINS.has(domain)) return false;
  // Image filenames sometimes match (.png@2x etc) — drop those.
  if (/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(lower)) return false;
  return true;
}

// Try to find a contact-person name near the email/phone. Best-effort —
// returns the first plausible "Name Surname" string that appears on the page.
// Looks specifically for "Contact: X", "Mr X", "Ms X", "Director: X", etc.
//
// IMPORTANT: keyword half is case-insensitive via `[Cc]ontact` etc; the name
// capture half stays case-SENSITIVE so a real proper-noun is required. Using
// the /i flag here was a footgun — it made [A-Z][a-z]+ match lowercase words
// like "for" and "and", which then got swallowed by the {0,2} trailer.
const CONTACT_NAME_RX = /(?:[Cc]ontact(?:\s+[Pp]erson)?|Mr\.?|Ms\.?|Mrs\.?|Dr\.?|[Dd]irector|[Mm]anager|[Ff]ounder|[Oo]wner|CEO|CTO|CMO|COO|[Hh]ead)\s*[:\-]?\s+([A-Z][a-z]{1,15}(?:\s+[A-Z][a-z]{1,15}){0,2})/g;

function extractFromHtml(html) {
  const text = String(html || '');
  if (!text) return { emails: [], phones: [], contactName: null };

  const emails = new Set();
  for (const m of text.matchAll(EMAIL_RX)) {
    const e = m[0].toLowerCase();
    if (isLikelyEmail(e)) emails.add(e);
  }

  const phones = new Set();
  for (const m of text.matchAll(PHONE_RX)) {
    const p = m[0].trim();
    if (isLikelyPhone(p)) phones.add(p);
  }

  let contactName = null;
  for (const m of text.matchAll(CONTACT_NAME_RX)) {
    const candidate = m[1]?.trim();
    if (candidate && candidate.length >= 3 && candidate.length <= 50) {
      contactName = candidate;
      break;
    }
  }

  return { emails: [...emails], phones: [...phones], contactName };
}

// ── Per-site visit ────────────────────────────────────────────────────────────

const NAV_TIMEOUT_MS = 15_000;
const SETTLE_MS = 1_000;

// The shallow paths we try if the homepage has no contact info. Order matters —
// /contact is the most common, then /about, then the rest.
const CONTACT_PATHS = ['/contact', '/contact-us', '/contactus', '/about', '/about-us', '/reach-us'];

/**
 * Visit one website and harvest contact info. Returns:
 *   { ok: true, url, emails, phones, contactName, finalUrl }
 *   { ok: false, url, error }
 *
 * @param {import('playwright').Browser} browser
 * @param {string} url
 */
async function scrapeOneSite(browser, url) {
  let context, page;
  try {
    // Normalize: prepend https:// if no protocol
    const target = /^https?:\/\//i.test(url) ? url : `https://${url}`;

    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 BetaZen-Bot/1.0',
      ignoreHTTPSErrors: true,
      bypassCSP: true,
    });
    // Cap requests / images so cold sites don't burn 30s downloading hero videos
    context.route('**/*', (route) => {
      const type = route.request().resourceType();
      if (type === 'image' || type === 'media' || type === 'font') return route.abort();
      return route.continue();
    });

    page = await context.newPage();
    page.setDefaultTimeout(NAV_TIMEOUT_MS);

    let finalUrl = target;
    const collected = { emails: new Set(), phones: new Set(), contactName: null };

    async function harvest() {
      // Inner-text catches what regexes need without parsing the DOM.
      const text = await page.content().catch(() => '');
      const { emails, phones, contactName } = extractFromHtml(text);
      for (const e of emails)  collected.emails.add(e);
      for (const p of phones)  collected.phones.add(p);
      if (!collected.contactName && contactName) collected.contactName = contactName;

      // mailto: / tel: hrefs that the regex may have missed when wrapped in JS
      const hrefs = await page.$$eval('a[href]', (els) => els.map((a) => a.getAttribute('href') || '')).catch(() => []);
      for (const href of hrefs) {
        if (href.startsWith('mailto:')) {
          const e = href.slice(7).split('?')[0].trim().toLowerCase();
          if (isLikelyEmail(e)) collected.emails.add(e);
        } else if (href.startsWith('tel:')) {
          const p = href.slice(4).trim();
          if (isLikelyPhone(p)) collected.phones.add(p);
        }
      }
    }

    try {
      const res = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
      if (res) finalUrl = page.url();
    } catch (err) {
      // Network / DNS / timeout — try the bare hostname over http:// as a last resort
      // for sites that misadvertise https.
      if (target.startsWith('https://')) {
        try {
          const httpFallback = target.replace(/^https:/i, 'http:');
          await page.goto(httpFallback, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
          finalUrl = page.url();
        } catch (err2) {
          return { ok: false, url, error: err2.message || err.message };
        }
      } else {
        return { ok: false, url, error: err.message };
      }
    }

    await page.waitForTimeout(SETTLE_MS);
    await harvest();

    // If the homepage is barren, try ONE shallow hop to a contact-style path.
    if (collected.emails.size === 0 && collected.phones.size === 0) {
      const origin = new URL(finalUrl).origin;
      for (const p of CONTACT_PATHS) {
        try {
          const res = await page.goto(origin + p, { waitUntil: 'domcontentloaded', timeout: 8000 });
          if (!res || !res.ok()) continue;
          await page.waitForTimeout(500);
          await harvest();
          if (collected.emails.size > 0 || collected.phones.size > 0) break;
        } catch { /* try next */ }
      }
    }

    return {
      ok: true,
      url,
      finalUrl,
      emails: [...collected.emails],
      phones: [...collected.phones],
      contactName: collected.contactName,
    };
  } catch (err) {
    return { ok: false, url, error: err.message };
  } finally {
    try { await page?.close(); } catch (_) { /* ignore */ }
    try { await context?.close(); } catch (_) { /* ignore */ }
  }
}

// ── Browser lifecycle ─────────────────────────────────────────────────────────

async function launchBrowser({ headless } = { headless: true }) {
  return chromium.launch({
    headless,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
}

module.exports = { launchBrowser, scrapeOneSite, extractFromHtml };
