/**
 * Load environment variables based on APP_STATE (local | dev | prod).
 *
 * Strategy:
 *   1. Load the base `.env` first (all required values + APP_STATE).
 *   2. If `.env.<APP_STATE>` exists locally, layer it on with
 *      override:false so values already set in `.env` still win.
 *   3. Resolve MONGODB_URI from state-specific keys:
 *        - if MONGODB_URI is already set explicitly, keep it
 *        - otherwise use `<STATE>_MONGODB_URI` (e.g. DEV_MONGODB_URI)
 *
 * `.env` and `.env.<state>` are both gitignored; only `.env.example`
 * is tracked. See backend/.env.example for the full key list.
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

// 3. Resolve MONGODB_URI from state-specific key if not explicitly set
if (!process.env.MONGODB_URI) {
  const stateKey = `${state.toUpperCase()}_MONGODB_URI`;
  if (process.env[stateKey]) {
    process.env.MONGODB_URI = process.env[stateKey];
    console.log(`[env] MONGODB_URI resolved from ${stateKey}`);
  }
}
