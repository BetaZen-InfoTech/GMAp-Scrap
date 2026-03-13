/**
 * Load .env BEFORE any config constants are evaluated.
 * Import this module at the top of config.ts so process.env is populated.
 *
 * NOTE: Do NOT use `app` from electron here — it is undefined at module load
 * time when Rollup bundles everything into a single CJS file.
 * Instead, use fs.existsSync to probe for the .env file.
 */
import { config } from 'dotenv';
import path from 'path';
import fs from 'fs';

// Dev mode: .env is 2 dirs up from dist-electron/main/
const devPath = path.join(__dirname, '../../.env');
// Packaged mode: .env is in process.resourcesPath
const prodPath = process.resourcesPath
  ? path.join(process.resourcesPath, '.env')
  : '';

const envPath = fs.existsSync(devPath) ? devPath : prodPath;

config({ path: envPath });
