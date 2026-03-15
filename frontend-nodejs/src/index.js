/**
 * BetaZen Google Maps Scraper — Node.js CLI
 *
 * Usage:
 *   npm start -- "hostname" startPincode endPincode   (range mode — single job)
 *   npm start -- "hostname" startPincode N            (multi-job — N jobs × 5 pincodes each)
 *
 * Examples:
 *   npm start -- "DEMO PC 1" 700061 700062   → range mode, pincodes 700061–700062
 *   npm start -- "DEMO PC 1" 700061 5        → 5 jobs × 5 pincodes = 25 pincodes
 *   npm start -- "DEMO PC 1" 700061 15       → 15 jobs × 5 pincodes = 75 pincodes
 *
 * Multiple instances can run independently (different pincode ranges).
 */

'use strict';

const readline = require('readline');
const { v4: uuidv4 } = require('uuid');
const axios  = require('axios');
const chalk  = require('chalk');

const { API_BASE_URL, APP_STATE, SETTINGS, EXCEL_DIR } = require('./config');
const { ScraperEngine }          = require('./scraper');
const { sendBatch }              = require('./batchSender');
const { generateExcel, uploadExcel } = require('./excelGenerator');
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

// ── CPU throttle — only start if CPU < 75% ───────────────────────────────────

const CPU_LIMIT = 75;

function cpuBar(percent) {
  const width = 20;
  const filled = Math.round((percent / 100) * width);
  const empty  = width - filled;
  const bar    = '█'.repeat(filled) + '░'.repeat(empty);
  if (percent >= CPU_LIMIT) return chalk.red(bar);
  if (percent >= 50)        return chalk.yellow(bar);
  return chalk.green(bar);
}

const CPU_MAX_WAIT_MS = 120_000;  // max 2 min wait, then proceed anyway

async function waitForCpu(tag) {
  let stats = await getSystemStats();
  if (stats.cpuUsed < CPU_LIMIT) return;

  const label = tag ? `${tag} ` : '';
  print(chalk.yellow(
    `  ${label}CPU ${cpuBar(stats.cpuUsed)} ${stats.cpuUsed}% ≥ ${CPU_LIMIT}% — waiting (max 2m)…`
  ));

  const deadline = Date.now() + CPU_MAX_WAIT_MS;
  let dots = 0;
  while (stats.cpuUsed >= CPU_LIMIT) {
    if (Date.now() >= deadline) {
      print(chalk.yellow(`  ${label}CPU still ${stats.cpuUsed}% — timeout, proceeding anyway`));
      return;
    }
    await sleep(1500);
    stats = await getSystemStats();
    dots = (dots + 1) % 4;
    const dotStr = '.'.repeat(dots + 1).padEnd(4);
    if (liveMonitor && liveMonitor.active) {
      liveMonitor.writeProgress(
        chalk.yellow(`  ${label}CPU ${cpuBar(stats.cpuUsed)} ${stats.cpuUsed}% — cooling down${dotStr}`)
      );
    } else {
      process.stdout.write(
        `\r${chalk.yellow(`  ${label}CPU ${cpuBar(stats.cpuUsed)} ${stats.cpuUsed}% — cooling down${dotStr}`)}`
      );
    }
  }

  if (!(liveMonitor && liveMonitor.active)) process.stdout.write('\n');
  print(chalk.green(`  ${label}CPU ${cpuBar(stats.cpuUsed)} ${stats.cpuUsed}% — ready!`));
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

async function fetchPincodes(start, end, limit) {
  const params = { start, end };
  if (limit) params.limit = limit;
  const res = await axios.get(`${API_BASE_URL}/api/pincodes/range`, {
    params, timeout: 30000,
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

// ── Job tracking helpers ─────────────────────────────────────────────────────

async function createJobTracking(jobId, deviceId, startPincode, endPincode, totalSearches) {
  try {
    await axios.post(`${API_BASE_URL}/api/scrape-tracking`, {
      jobId, deviceId, startPincode, endPincode, totalSearches,
    }, { timeout: 15000 });
  } catch { /* fire-and-forget */ }
}

async function updateJobProgress(jobId, update) {
  try {
    await axios.patch(`${API_BASE_URL}/api/scrape-tracking/${jobId}`, update, { timeout: 10000 });
  } catch { /* fire-and-forget */ }
}

async function markSearchComplete(jobId, data) {
  try {
    await axios.post(`${API_BASE_URL}/api/scrape-tracking/${jobId}/search-complete`, data, { timeout: 10000 });
  } catch { /* fire-and-forget */ }
}

async function fetchExistingJob(deviceId, startPincode, endPincode) {
  try {
    const params = {};
    if (startPincode != null) params.startPincode = startPincode;
    if (endPincode != null) params.endPincode = endPincode;
    const res = await axios.get(`${API_BASE_URL}/api/scrape-tracking/${deviceId}`, { params, timeout: 10000 });
    return res.data || null;
  } catch { return null; }
}

async function fetchCompletedSearchesForJob(jobId) {
  try {
    const res = await axios.get(
      `${API_BASE_URL}/api/scrape-tracking/${jobId}/completed-searches`,
      { timeout: 10000 }
    );
    return Array.isArray(res.data) ? res.data : [];
  } catch { return []; }
}

// ── Already-scraped check ─────────────────────────────────────────────────────

const completedCache = new Set();

async function isAlreadyScraped(keyword, round) {
  const cacheKey = `${keyword}|R${round}`;
  if (completedCache.has(cacheKey)) return true;
  try {
    const res = await axios.get(
      `${API_BASE_URL}/api/scraped-data/session-stats/check-completed`,
      { params: { keyword, round }, timeout: 10000 }
    );
    if (res.data?.completed === true) { completedCache.add(cacheKey); return true; }
  } catch { /* assume not completed */ }
  return false;
}

// ── Keyword builder ───────────────────────────────────────────────────────────

function buildKeyword(pincode, district, stateName, niche) {
  return (
    `get all ${niche.SubCategory} (${niche.Category}) ` +
    `from ${district}, ${stateName}, Pin - ${pincode}`
  );
}

// ── Single scraping session ───────────────────────────────────────────────────

async function runSession(keyword, pincode, deviceId, scrapCategory, scrapSubCategory, extraContext) {
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
        sendBatch(batch, bNum, sessionId, keyword, pincode, deviceId, scrapCategory, scrapSubCategory, extraContext?.round)
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
      const result = await sendBatch(batch, bNum, sessionId, keyword, pincode, deviceId, scrapCategory, scrapSubCategory, extraContext?.round);
      if (result.success) {
        inserted   += result.count          ?? 0;
        duplicates += result.duplicateCount ?? 0;
        batchesSent++;
        print(chalk.green(`  [Batch ${bNum}] ${result.count} saved, ${result.duplicateCount ?? 0} dups`));
      } else {
        print(chalk.red(`  [Batch ${bNum}] FAILED: ${result.error}`));
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

  print(chalk.bold.green('  ┌───────────────────────────────────┐'));
  print(chalk.bold.green('  │') + chalk.white(` Records: ${chalk.bold.cyan(totalScraped)}  Saved: ${chalk.bold.green(inserted)}  Dups: ${chalk.bold.yellow(duplicates)}`) + ' '.repeat(Math.max(1, 18 - String(totalScraped).length - String(inserted).length - String(duplicates).length)) + chalk.bold.green('│'));
  print(chalk.bold.green('  └───────────────────────────────────┘'));

  let excelUploaded = false;
  if (totalScraped > 0) {
    const excelResult = await generateExcel(sessionId, keyword, allRecords, EXCEL_DIR);
    if (excelResult.success) {
      print(chalk.green(`  Excel  : ${excelResult.filePath}`));
      // Upload Excel to backend
      const uploadResult = await uploadExcel(excelResult.filePath, sessionId, keyword, deviceId);
      if (uploadResult.success) {
        excelUploaded = true;
        print(chalk.green(`  Upload : Excel uploaded to server`));
      } else {
        print(chalk.yellow(`  Upload : failed — ${uploadResult.error}`));
      }
    } else {
      print(chalk.yellow(`  Excel  : failed — ${excelResult.error}`));
    }
  }

  postSessionStats({
    sessionId, deviceId: deviceId || undefined, keyword,
    jobId: extraContext?.jobId,
    pincode: Number(pincode) || undefined,
    district: extraContext?.district,
    stateName: extraContext?.stateName,
    category: scrapCategory,
    subCategory: scrapSubCategory,
    round: extraContext?.round,
    totalRecords: totalScraped, insertedRecords: inserted,
    duplicateRecords: duplicates, batchesSent,
    excelUploaded, status: 'completed',
    startedAt: startTime, completedAt: endTime,
    durationMs: new Date(endTime).getTime() - new Date(startTime).getTime(),
  });

  return { totalScraped, sessionId };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const timeStr = new Date().toLocaleString('en-IN');
  const lines = [
    `   ENV  : ${APP_STATE.toUpperCase()}`,
    `   API  : ${API_BASE_URL}`,
    `   Time : ${timeStr}`,
  ];
  const boxW = Math.max(52, ...lines.map(l => l.length + 2));
  const pad = (str) => str + ' '.repeat(boxW - str.length);

  console.log('');
  console.log(chalk.bold.cyan(`  ╔${'═'.repeat(boxW)}╗`));
  console.log(chalk.bold.cyan('  ║') + chalk.bold.white(pad('   BetaZen Google Maps Scraper  —  Node.js CLI')) + chalk.bold.cyan('║'));
  console.log(chalk.bold.cyan(`  ╠${'═'.repeat(boxW)}╣`));
  for (const line of lines) {
    console.log(chalk.bold.cyan('  ║') + chalk.white(pad(line)) + chalk.bold.cyan('║'));
  }
  console.log(chalk.bold.cyan(`  ╚${'═'.repeat(boxW)}╝`));
  console.log('');

  await printStats('Startup');
  console.log('');

  // ── CLI args: npm start -- "hostname" startPincode endPincode ───────────
  //   e.g.  node src/index.js "DEMO PC 1" 700061 700062
  //   or    node src/index.js 700061 700062  (uses os.hostname())
  const [,, argNickname, argStart, argEnd] = process.argv;

  // ── Device registration / verification ───────────────────────────────────
  const deviceId = await ensureDevice(chalk, argNickname || undefined);
  const rl = makeRl();
  console.log('');

  // ── Pincode input ─────────────────────────────────────────────────────────
  let startPincode, endPincode;

  if (argStart && argEnd) {
    // Args provided — no interactive prompt needed
    startPincode = parseInt(argStart, 10);
    endPincode   = parseInt(argEnd,   10);
    rl.close();
    if (parseInt(argEnd, 10) < 1000) {
      console.log(chalk.cyan(`  Using CLI args: start=${startPincode}, ${endPincode} jobs × 5 pincodes`));
    } else {
      console.log(chalk.cyan(`  Using CLI args: ${startPincode} → ${endPincode}`));
    }
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

  // ── Detect mode ─────────────────────────────────────────────────────────
  // If 3rd arg is a valid 6-digit pincode → range mode (single job)
  // If 3rd arg is small number (< 1000) → multi-job mode
  //   3rd arg = number of jobs, each job gets 5 pincodes
  //   e.g. 700061 5  → 5 jobs × 5 pincodes = 25 pincodes total
  //   e.g. 700061 15 → 15 jobs × 5 pincodes = 75 pincodes total
  const PINCODES_PER_JOB = 5;
  const isMultiJobMode = endPincode < 1000;
  const numberOfJobs   = isMultiJobMode ? endPincode : 0;
  const totalNeeded    = isMultiJobMode ? numberOfJobs * PINCODES_PER_JOB : 0;

  if (!isMultiJobMode && startPincode > endPincode) {
    console.log(chalk.red('\nStart pincode must be ≤ end pincode. Exiting.'));
    process.exit(1);
  }

  // ── Fetch data ────────────────────────────────────────────────────────────
  console.log(chalk.cyan(`\nFetching data from ${API_BASE_URL} …`));

  let allPincodes, niches;
  try {
    [allPincodes, niches] = await Promise.all([
      isMultiJobMode
        ? fetchPincodes(startPincode, 999999, totalNeeded)   // fetch only what we need
        : fetchPincodes(startPincode, endPincode),
      fetchNiches(),
    ]);
  } catch (err) {
    console.log(chalk.red(`\nAPI error: ${err.message}`));
    console.log(chalk.yellow(`Ensure backend is running at ${API_BASE_URL}`));
    process.exit(1);
  }

  if (allPincodes.length === 0) {
    console.log(chalk.yellow('\nNo pincodes found. Exiting.'));
    process.exit(0);
  }

  // ── Split into jobs (multi-job: 5 pincodes per job) ────────────────────
  const pincodeChunks = [];
  if (isMultiJobMode) {
    // Take only the first totalNeeded pincodes, split into jobs of 5
    const needed = allPincodes.slice(0, totalNeeded);
    for (let i = 0; i < needed.length; i += PINCODES_PER_JOB) {
      pincodeChunks.push(needed.slice(i, i + PINCODES_PER_JOB));
    }
    if (pincodeChunks.length < numberOfJobs) {
      console.log(chalk.yellow(
        `\n  Warning: Only ${allPincodes.length} pincodes available from ${startPincode}, ` +
        `created ${pincodeChunks.length} jobs instead of ${numberOfJobs}`
      ));
    }
  } else {
    pincodeChunks.push(allPincodes);
  }

  const totalPincodes  = pincodeChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const totalJobs      = pincodeChunks.length;
  const grandTotal     = totalPincodes * niches.length * 3;

  console.log('');
  console.log(chalk.bold.yellow('  ┌─────────────────────────────────────┐'));
  console.log(chalk.bold.yellow('  │') + chalk.bold.white('        Scraping Plan Summary         ') + chalk.bold.yellow('│'));
  console.log(chalk.bold.yellow('  ├─────────────────────────────────────┤'));
  console.log(chalk.bold.yellow('  │') + chalk.white(`  Pincodes : ${chalk.bold.cyan(totalPincodes)}`) + ' '.repeat(24 - String(totalPincodes).length) + chalk.bold.yellow('│'));
  console.log(chalk.bold.yellow('  │') + chalk.white(`  Niches   : ${chalk.bold.cyan(niches.length)}`) + ' '.repeat(24 - String(niches.length).length) + chalk.bold.yellow('│'));
  console.log(chalk.bold.yellow('  │') + chalk.white(`  Rounds   : ${chalk.bold.cyan(3)}`) + ' '.repeat(23) + chalk.bold.yellow('│'));
  if (isMultiJobMode) {
    console.log(chalk.bold.yellow('  │') + chalk.white(`  Per Job  : ${chalk.bold.cyan(PINCODES_PER_JOB)} pincodes`) + ' '.repeat(15 - String(PINCODES_PER_JOB).length) + chalk.bold.yellow('│'));
    console.log(chalk.bold.yellow('  │') + chalk.white(`  Jobs     : ${chalk.bold.cyan(totalJobs)}`) + ' '.repeat(24 - String(totalJobs).length) + chalk.bold.yellow('│'));
  }
  console.log(chalk.bold.yellow('  ├─────────────────────────────────────┤'));
  console.log(chalk.bold.yellow('  │') + chalk.bold.white(`  TOTAL    : ${chalk.bold.green(grandTotal)} searches`) + ' '.repeat(15 - String(grandTotal).length) + chalk.bold.yellow('│'));
  console.log(chalk.bold.yellow('  └─────────────────────────────────────┘'));
  console.log('');

  // ── Start live stats monitor ──────────────────────────────────────────────
  liveMonitor = new LiveMonitor();
  await liveMonitor.start(chalk, deviceId, 2000);

  // ── Phase 1: Create/resume ALL jobs upfront ───────────────────────────────
  const jobDefs = [];

  for (let chunkIdx = 0; chunkIdx < pincodeChunks.length; chunkIdx++) {
    const pincodes      = pincodeChunks[chunkIdx];
    const chunkStart    = pincodes[0].Pincode;
    const chunkEnd      = pincodes[pincodes.length - 1].Pincode;
    const totalSearches = pincodes.length * niches.length * 3;

    let jobId;
    const completedJobSearches = new Set();
    let jobCompletedCount = 0;

    const existingJob = await fetchExistingJob(deviceId, chunkStart, chunkEnd);
    if (
      existingJob &&
      existingJob.status !== 'completed' &&
      existingJob.status !== 'stopped'
    ) {
      jobId = existingJob.jobId;
      const doneSearches = await fetchCompletedSearchesForJob(jobId);
      for (const cs of doneSearches) {
        completedJobSearches.add(`${cs.pincode}|${cs.category}|${cs.subCategory}|${cs.round}`);
      }
      jobCompletedCount = doneSearches.length;
      print(chalk.cyan(`  [Job ${chunkIdx + 1}/${totalJobs}] Resuming ${jobId.substring(0, 8)}… (${doneSearches.length} already done)`));
      updateJobProgress(jobId, { status: 'running' });
    } else {
      jobId = uuidv4();
      await createJobTracking(jobId, deviceId, chunkStart, chunkEnd, totalSearches);
      print(chalk.cyan(`  [Job ${chunkIdx + 1}/${totalJobs}] Created ${jobId.substring(0, 8)}… Pin ${chunkStart} → ${chunkEnd}`));
    }

    jobDefs.push({ chunkIdx, pincodes, chunkStart, chunkEnd, totalSearches, jobId, completedJobSearches, jobCompletedCount });
  }

  if (totalJobs > 1) {
    print(chalk.bold.green(`\n  All ${totalJobs} jobs registered — launching in parallel…\n`));
  }

  // ── Phase 2: Execute jobs in parallel ──────────────────────────────────────

  async function executeJob(jobDef) {
    const { chunkIdx, pincodes, chunkStart, chunkEnd, totalSearches, jobId, completedJobSearches } = jobDef;
    let jobCompletedCount = jobDef.jobCompletedCount;
    const tag = `[Job ${chunkIdx + 1}/${totalJobs}]`;

    print(chalk.bold.cyan(
      `\n${'═'.repeat(60)}\n` +
      `  ${tag}  Pin ${chunkStart} → ${chunkEnd}  (${pincodes.length} pincodes, ${totalSearches} searches)\n` +
      `${'═'.repeat(60)}`
    ));

    let completed = 0;
    let skippedCount = 0;

    function flushSkipped() {
      if (skippedCount > 0) {
        print(chalk.yellow(`  ${tag} ⟳ Skipped ${skippedCount} already completed`));
        skippedCount = 0;
      }
    }

    for (let pIdx = 0; pIdx < pincodes.length; pIdx++) {
      const pincodeInfo = pincodes[pIdx];
      flushSkipped();
      print(chalk.bold.cyan(`\n  ${tag} Pincode ${pIdx + 1}/${pincodes.length}: ${pincodeInfo.Pincode} (${pincodeInfo.District})`));

      for (let round = 1; round <= 3; round++) {
        print(chalk.cyan(`  ${tag} Round ${round}/3`));
        for (const niche of niches) {

          if (!pincodeInfo.Pincode || !niche.SubCategory || !niche.Category) continue;

          const keyword = buildKeyword(
            pincodeInfo.Pincode, pincodeInfo.District,
            pincodeInfo.StateName, niche
          );

          completed++;

          // Check if already completed in this job (resume support)
          const searchKey = `${pincodeInfo.Pincode}|${niche.Category}|${niche.SubCategory}|${round}`;
          if (completedJobSearches.has(searchKey)) {
            skippedCount++;
            continue;
          }

          // Check if already scraped globally (across all jobs)
          const alreadyDone = await isAlreadyScraped(keyword, round);
          if (alreadyDone) {
            skippedCount++;
            markSearchComplete(jobId, {
              deviceId, pincode: pincodeInfo.Pincode,
              district: pincodeInfo.District, stateName: pincodeInfo.StateName,
              category: niche.Category, subCategory: niche.SubCategory, round,
            });
            jobCompletedCount++;
            updateJobProgress(jobId, { completedSearches: jobCompletedCount, status: 'running' });
            continue;
          }

          // Print skipped summary before starting a new scrape
          flushSkipped();

          const prefix = `${tag} [${completed}/${totalSearches}]`;
          print(chalk.bold.white(
            `\n${'━'.repeat(60)}\n` +
            `  ${prefix}  ${keyword}\n` +
            `  Round: ${round}\n` +
            `${'━'.repeat(60)}`
          ));

          try {
            await waitForCpu(tag);
            const result = await runSession(
              keyword, pincodeInfo.Pincode, deviceId,
              niche.Category, niche.SubCategory,
              { district: pincodeInfo.District, stateName: pincodeInfo.StateName, round, jobId }
            );
            print(chalk.bold.green(`  ${tag} ✓ Completed  (${result.totalScraped} records)`));
            completedCache.add(`${keyword}|R${round}`);

            jobCompletedCount++;
            markSearchComplete(jobId, {
              deviceId, pincode: pincodeInfo.Pincode,
              district: pincodeInfo.District, stateName: pincodeInfo.StateName,
              category: niche.Category, subCategory: niche.SubCategory,
              round, sessionId: result.sessionId,
            });
            updateJobProgress(jobId, { completedSearches: jobCompletedCount, status: 'running' });
          } catch (err) {
            print(chalk.red(`  ${tag} ✗ Error: ${err.message}`));
          }

          await sleep(2000);
        }   // end niche loop
      }     // end round loop
    }       // end pincode loop

    flushSkipped();  // print any remaining skipped count

    // ── Mark job completed ──────────────────────────────────────────────
    updateJobProgress(jobId, { completedSearches: jobCompletedCount, status: 'completed' });
    print(chalk.bold.green(`  ${tag} ✓ Job completed (${jobCompletedCount} searches)`));
  }

  // Launch all jobs in parallel
  await Promise.all(jobDefs.map(jobDef => executeJob(jobDef)));

  // ── Done ──────────────────────────────────────────────────────────────────
  liveMonitor.stop();
  liveMonitor = null;

  const jobsText = totalJobs > 1 ? `${totalJobs} jobs finished` : 'Job finished';
  const endW = 52;
  const endPad = (s) => s + ' '.repeat(Math.max(0, endW - s.length));
  console.log('');
  console.log(chalk.bold.green(`  ╔${'═'.repeat(endW)}╗`));
  console.log(chalk.bold.green('  ║') + chalk.bold.white(endPad('          All scraping completed!')) + chalk.bold.green('║'));
  console.log(chalk.bold.green('  ║') + chalk.white(endPad(`          ${jobsText}`)) + chalk.bold.green('║'));
  console.log(chalk.bold.green(`  ╚${'═'.repeat(endW)}╝`));
  console.log('');

  await printStats('Final');
  process.exit(0);
}

// ── Entry point ───────────────────────────────────────────────────────────────

main().catch((err) => {
  if (liveMonitor) { liveMonitor.stop(); liveMonitor = null; }
  console.error(chalk.red(`\nFatal error: ${err.message}`));
  process.exit(1);
});
