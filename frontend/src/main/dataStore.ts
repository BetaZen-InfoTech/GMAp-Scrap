import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { SessionState } from '../shared/types';

function ensureDir(dir: string): string {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getSessionsDir(): string {
  return ensureDir(path.join(app.getPath('userData'), 'sessions'));
}

export function getExcelDir(): string {
  return ensureDir(path.join(app.getPath('userData'), 'excel'));
}

export function getLogsDir(): string {
  return ensureDir(path.join(app.getPath('userData'), 'logs'));
}

export function getUserDataPath(): string {
  return app.getPath('userData');
}

export function saveSession(session: SessionState): void {
  try {
    const filePath = path.join(getSessionsDir(), `${session.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf8');
  } catch {
    // Never fail because of persistence
  }
}

export function loadAllPersistedSessions(): SessionState[] {
  try {
    const dir = getSessionsDir();
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    const sessions: SessionState[] = [];
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(dir, file), 'utf8');
        const session = JSON.parse(raw) as SessionState;
        // Auto-fill excelPath if missing or file no longer exists
        if (session.status === 'completed' && (!session.excelPath || !fs.existsSync(session.excelPath))) {
          const found = getExcelFilePath(session.id);
          if (found) {
            session.excelPath = found;
            // Persist the fix so it's not re-detected every load
            fs.writeFileSync(path.join(dir, file), JSON.stringify(session, null, 2), 'utf8');
          }
        }
        sessions.push(session);
      } catch {
        // Skip corrupted files
      }
    }
    return sessions.sort(
      (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    );
  } catch {
    return [];
  }
}

export function getExcelFilePath(sessionId: string): string | null {
  try {
    const dir = getExcelDir();
    const prefix = sessionId.substring(0, 8);
    // Filename format: keyword_date_SESSIONPREFIX.xlsx — match by the session prefix segment
    const files = fs.readdirSync(dir).filter((f) => f.includes(prefix) && f.endsWith('.xlsx'));
    if (files.length === 0) return null;
    // Return the most recently modified one
    const sorted = files
      .map((f) => ({ f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    return path.join(dir, sorted[0].f);
  } catch {
    return null;
  }
}
