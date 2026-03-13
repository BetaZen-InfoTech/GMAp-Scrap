/**
 * Load .env BEFORE any config constants are evaluated.
 * Import this module at the top of config.ts so process.env is populated.
 */
import { config } from 'dotenv';
import { app } from 'electron';
import path from 'path';

config({
  path: app.isPackaged
    ? path.join(process.resourcesPath, '.env')
    : path.join(__dirname, '../../.env'),
});
