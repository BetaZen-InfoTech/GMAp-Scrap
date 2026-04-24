/**
 * Load environment variables based on APP_STATE (local | dev | prod).
 *
 * Strategy:
 *   1. Load the base `.env` first (device-specific secrets + APP_STATE).
 *   2. Inspect APP_STATE and load `.env.<state>` with `override: false` so
 *      any value already set in `.env` still wins.
 *
 * This lets a VPS keep APP_STATE=prod in `.env` while the committed
 * `.env.prod` provides the default URIs.
 */
const { config } = require('dotenv');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '../../');

// 1. Load device-specific .env first (has precedence)
const basePath = path.join(rootDir, '.env');
if (fs.existsSync(basePath)) {
  config({ path: basePath });
}

// 2. Pick state-specific env file based on APP_STATE
const state = (process.env.APP_STATE || 'dev').toLowerCase();
const stateFile = path.join(rootDir, `.env.${state}`);
if (fs.existsSync(stateFile)) {
  // override:false — don't clobber values already loaded from .env
  config({ path: stateFile, override: false });
  console.log(`[env] Loaded ${path.basename(stateFile)} (state: ${state})`);
} else {
  console.log(`[env] No .env.${state} file — using base .env only`);
}
