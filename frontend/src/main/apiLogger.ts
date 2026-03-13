import fs from 'fs';
import path from 'path';
import { ApiLogEntry } from '../shared/types';
import { getLogsDir } from './dataStore';

function getLogFile(): string {
  return path.join(getLogsDir(), 'api-calls.log');
}

export function logApiCall(entry: ApiLogEntry): void {
  try {
    fs.appendFileSync(getLogFile(), JSON.stringify(entry) + '\n', 'utf8');
  } catch {
    // Never fail because of logging
  }
}

export function readApiLogs(limit = 500, sessionId?: string): ApiLogEntry[] {
  try {
    const logFile = getLogFile();
    if (!fs.existsSync(logFile)) return [];
    const content = fs.readFileSync(logFile, 'utf8');
    const entries = content
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try { return JSON.parse(line) as ApiLogEntry; } catch { return null; }
      })
      .filter((e): e is ApiLogEntry => e !== null);

    const filtered = sessionId ? entries.filter((e) => e.sessionId === sessionId) : entries;
    return filtered.slice(-limit).reverse(); // newest first
  } catch {
    return [];
  }
}

export function clearApiLogs(): void {
  try {
    const logFile = getLogFile();
    if (fs.existsSync(logFile)) fs.writeFileSync(logFile, '', 'utf8');
  } catch {
    // ignore
  }
}
