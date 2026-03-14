/**
 * BetaZen Google Maps Scraper — Node.js CLI
 *
 * Usage:  npm start
 *  1. Registers device (one-time) or verifies existing registration
 *  2. Asks for Starting Pincode and Ending Pincode
 *  3. Iterates all pincodes × rounds × niches
 *  4. Sends batches of 10 records to backend API
 *  5. Saves Excel per session in ./excel/
 *  6. Live stats bar: CPU / RAM / Disk / Net speed / Net data — updated every 2 s
 *  7. Uploads device stats snapshots to /api/device-history every 30 s
 *
 * Multiple instances can run independently (different pincode ranges).
 */

'use strict';

const readline = require('readline');
const { v4: uuidv4 } = require('uuid');
const axios  = require('axios');
const chalk  = require('chalk');

const { API_BASE_URL, SETTINGS, EXCEL_DIR } = require('./config');
const { ScraperEngine }          = require('./scraper');
const { sendBatch }              = require('./batchSender');
const { generateExcel }          = require('./excelGenerator');
const { getSystemStats, LiveMonitor } = require('./monitor');
const { ensureDevice }           = require('./deviceManager');

// ── Module-level live monitor (shared by all helpers) ─────────────────────────
let liveMonitor = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRl() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}
function ask(rl, q) {
  return new Promise((resolve) => rl.question(chalk.yellow(q), resolve));
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Use instead of console.log — keeps the live bar at the bottom. */
function print(...args) {
  if (liveMonitor && liveMonitor.active) {
    liveMonitor.print(...args);
  } else {
    console.log(...args);
  }
}

// ── One-time stats snapshot (used before live bar starts) ─────────────────────
async function printStats(label) {
  try {
    const s = await getSystemStats();
    const prefix = label ? `${label} | ` : '';
    console.log(chalk.bgBlue.white(
      ` [SYS] ${prefix}` +
      `CPU: ${s.cpuUsed}% | ` +
      `RAM: ${s.ramUsedMB}/${s.ramTotalMB} MB (${s.ramUsedPercent}%) | ` +
      `Disk: ${s.diskUsedGB}/${s.diskTotalGB} GB (${s.diskUsedPercent}%) | ` +
      `Net: ↓${s.netDownKBps} KB/s ↑${s.netUpKBps} KB/s `
    ));
  } catch { /* ignore */ }
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function fetchPincodes(start, end) {
  const res = await axios.get(`${API_BASE_URL}/api/pincodes/range`, {
    params: { start, end }, timeout: 30000,
  });
  return Array.isArray(res.data) ? res.data : [];
}

async function fetchNiches() {
  const res = await axios.get(`${API_BASE_URL}/api/niches`, { timeout: 30000 });
  return Array.isArray(res.data) ? res.data : [];
}

async function postSessionStats(payload) {
  try {
    await axios.post(`${API_BASE_URL}/api/scraped-data/session-stats`, payload, { timeout: 15000 });
  } catch { /* fire-and-forget */ }
}

// ── Already-scraped check ─────────────────────────────────────────────────────

const completedCache = new Set();

async function isAlreadyScraped(keyword) {
  if (completedCache.has(keyword)) return true;
  try {
    const res = await axios.get(
      `${API_BASE_URL}/api/scraped-data/session-stats/check-completed`,
      { params: { keyword }, timeout: 10000 }
    );
    if (res.data?.completed === true) { completedCache.add(keyword); return true; }
  } catch { /* assume not completed */ }
  return false;
}

// ── Keyword builder ───────────────────────────────────────────────────────────

function buildKeyword(pincode, district, stateName, niche, round) {
  return (
    `get all ${niche.SubCategory} (${niche.Category}) ` +
    `from ${district}, ${stateName}, Pin - ${pincode} [Round ${round}]`
  );
}

// ── Single scraping session ───────────────────────────────────────────────────

async function runSession(keyword, pincode, deviceId) {
  const sessionId  = uuidv4();
  const startTime  = new Date().toISOString();
  const allRecords = [];
  let pendingBatch = [];
  let batchNumber  = 0;
  let inserted     = 0;
  let duplicates   = 0;
  let batchesSent  = 0;
  let statusError  = null;

  const callbacks = {
    onRecord(record) {
      allRecords.push(record);
      pendingBatch.push(record);

      if (pendingBatch.length >= SETTINGS.batchSize) {
        const batch = pendingBatch.splice(0);
        const bNum  = ++batchNumber;
        sendBatch(batch, bNum, sessionId, keyword, pincode, deviceId)
          .then((result) => {
            if (result.success) {
              inserted   += result.count          ?? 0;
              duplicates += result.duplicateCount ?? 0;
              batchesSent++;
              print(chalk.green(`  [Batch ${bNum}] ${result.count} saved, ${result.duplicateCount} dups`));
            } else {
              print(chalk.red(`  [Batch ${bNum}] FAILED: ${result.error}`));
            }
          })
          .catch(() => {});
      }
    },

    onProgress(total) {
      const text = chalk.cyan(`  Scraped: ${total} records...`);
      if (liveMonitor && liveMonitor.active) {
        liveMonitor.writeProgress(text);
      } else {
        process.stdout.write(`\r${text}`);
      }
    },

    onUrlsCollected(total) {
      print(chalk.cyan(`  Found ${total} places in feed, extracting in parallel...`));
    },

    onStatusChange(status, error) {
      if (status === 'error') statusError = error || 'Scraping error';
    },

    onScrapError() { /* silently skip individual failures */ },
  };

  const engine = new ScraperEngine(sessionId, keyword, SETTINGS, callbacks);
  await engine.start();

  // Flush remaining records
  if (pendingBatch.length > 0) {
    const batch = pendingBatch.splice(0);
    const bNum  = ++batchNumber;
    try {
      const result = await sendBatch(batch, bNum, sessionId, keyword, pincode, deviceId);
      if (result.success) {
        inserted   += result.count          ?? 0;
        duplicates += result.duplicateCount ?? 0;
        batchesSent++;
      }
    } catch { /* ignore */ }
  }

  // Clear progress line
  if (liveMonitor && liveMonitor.active) {
    liveMonitor.writeProgress('');
  } else {
    process.stdout.write('\n');
  }

  if (statusError) throw new Error(statusError);

  const endTime      = new Date().toISOString();
  const totalScraped = allRecords.length;

  print(chalk.green(`  Records: ${totalScraped} | Saved: ${inserted} | Dups: ${duplicates}`));

  if (totalScraped > 0) {
    const excelResult = await generateExcel(sessionId, keyword, allRecords, EXCEL_DIR);
    if (excelResult.success) {
      print(chalk.green(`  Excel  : ${excelResult.filePath}`));
    } else {
      print(chalk.yellow(`  Excel  : failed — ${excelResult.error}`));
    }
  }

  postSessionStats({
    sessionId, deviceId: deviceId || undefined, keyword,
    totalRecords: totalScraped, insertedRecords: inserted,
    duplicateRecords: duplicates, batchesSent,
    excelUploaded: false, status: 'completed',
    startedAt: startTime, completedAt: endTime,
    durationMs: new Date(endTime).getTime() - new Date(startTime).getTime(),
  });

  return { totalScraped };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(chalk.bold.cyan(
    '\n╔═══════════════════════════════════════════════════╗\n' +
    '║  BetaZen Google Maps Scraper  —  Node.js CLI      ║\n' +
    '╚═══════════════════════════════════════════════════╝\n'
  ));

  await printStats('Startup');
  console.log('');

  // ── CLI args: npm start [deviceNickname] [startPincode] [endPincode] ─────
  //   e.g.  node src/index.js "Office PC 1" 110001 110010
  //   or    npm start -- "Office PC 1" 110001 110010
  const [,, argNickname, argStart, argEnd] = process.argv;

  // ── Device registration / verification ───────────────────────────────────
  const rl    = makeRl();
  const askFn = argNickname
    ? () => Promise.resolve(argNickname)          // use CLI arg, skip prompt
    : (q) => ask(rl, q);

  const deviceId = await ensureDevice(askFn, chalk);
  console.log('');

  // ── Pincode input ─────────────────────────────────────────────────────────
  let startPincode, endPincode;

  if (argStart && argEnd) {
    // Args provided — no interactive prompt needed
    startPincode = parseInt(argStart, 10);
    endPincode   = parseInt(argEnd,   10);
    rl.close();
    console.log(chalk.cyan(`  Using CLI args: ${startPincode} → ${endPincode}`));
  } else {
    try {
      startPincode = parseInt(await ask(rl, 'Enter Starting Pincode : '), 10);
      endPincode   = parseInt(await ask(rl, 'Enter Ending Pincode   : '), 10);
    } finally {
      rl.close();
    }
  }

  if (isNaN(startPincode) || isNaN(endPincode)) {
    console.log(chalk.red('\nInvalid pincode. Exiting.'));
    process.exit(1);
  }
  if (startPincode > endPincode) {
    console.log(chalk.red('\nStart pincode must be ≤ end pincode. Exiting.'));
    process.exit(1);
  }

  // ── Fetch data ────────────────────────────────────────────────────────────
  console.log(chalk.cyan(`\nFetching data from ${API_BASE_URL} …`));

  let pincodes, niches;
  try {
    [pincodes, niches] = await Promise.all([
      fetchPincodes(startPincode, endPincode),
      fetchNiches(),
    ]);
  } catch (err) {
    console.log(chalk.red(`\nAPI error: ${err.message}`));
    console.log(chalk.yellow(`Ensure backend is running at ${API_BASE_URL}`));
    process.exit(1);
  }

  if (pincodes.length === 0) {
    console.log(chalk.yellow('\nNo pincodes found. Exiting.'));
    process.exit(0);
  }

  const totalSearches = pincodes.length * niches.length * 3;

  console.log('');
  console.log(chalk.white(`  Pincodes : ${chalk.bold(pincodes.length)}`));
  console.log(chalk.white(`  Niches   : ${chalk.bold(niches.length)}`));
  console.log(chalk.white(`  Rounds   : ${chalk.bold(3)}`));
  console.log(chalk.bold.white(`  Total    : ${chalk.bold(totalSearches)} searches`));
  console.log('');

  // ── Start live stats monitor ──────────────────────────────────────────────
  liveMonitor = new LiveMonitor();
  await liveMonitor.start(chalk, deviceId, 2000);

  // ── Scraping loop ─────────────────────────────────────────────────────────
  let completed = 0;

  for (const pincodeInfo of pincodes) {
    for (let round = 1; round <= 3; round++) {
      for (const niche of niches) {

        if (!pincodeInfo.Pincode || !niche.SubCategory || !niche.Category) continue;

        const keyword = buildKeyword(
          pincodeInfo.Pincode, pincodeInfo.District,
          pincodeInfo.StateName, niche, round
        );

        completed++;

        print(chalk.bold.white(
          `\n${'━'.repeat(60)}\n` +
          `  [${completed}/${totalSearches}]  ${keyword}\n` +
          `${'━'.repeat(60)}`
        ));

        // Check if already scraped
        const alreadyDone = await isAlreadyScraped(keyword);
        if (alreadyDone) {
          print(chalk.yellow('  ⟳ Already scraped — skipping'));
          continue;
        }

        try {
          const result = await runSession(keyword, pincodeInfo.Pincode, deviceId);
          print(chalk.bold.green(`  ✓ Completed  (${result.totalScraped} records)`));
          completedCache.add(keyword);
        } catch (err) {
          print(chalk.red(`  ✗ Error: ${err.message}`));
        }

        await sleep(2000);
      }   // end niche loop
    }     // end round loop
  }       // end pincode loop

  // ── Done ──────────────────────────────────────────────────────────────────
  liveMonitor.stop();
  liveMonitor = null;

  console.log(chalk.bold.green(
    '\n╔═══════════════════════════════════════════════════╗\n' +
    '║           All scraping completed!                 ║\n' +
    '╚═══════════════════════════════════════════════════╝\n'
  ));

  await printStats('Final');
  process.exit(0);
}

// ── Entry point ───────────────────────────────────────────────────────────────

main().catch((err) => {
  if (liveMonitor) { liveMonitor.stop(); liveMonitor = null; }
  console.error(chalk.red(`\nFatal error: ${err.message}`));
  process.exit(1);
});
