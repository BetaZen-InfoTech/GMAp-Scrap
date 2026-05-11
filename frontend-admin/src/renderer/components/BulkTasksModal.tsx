import React, { useMemo, useState } from 'react';
import api from '../lib/api';
import { useDeviceStore } from '../store/useDeviceStore';
import type { DeviceInfo, ScrapeTask } from '../../shared/types';

type TaskType = 'range' | 'single' | 'jobs';

interface BulkResult {
  type: TaskType;
  /** Devices the filter matched (i.e. persisted, even if unchanged). */
  devicesMatched?: number;
  /** Devices where the new task list actually differed from the old. */
  devicesUpdated: number;
  devicesNotFound: number;
  rowsAccepted: number;
  rowsRejected: number;
  errors: string[];
}

interface BulkTasksModalProps {
  onClose: () => void;
  /** Called after a successful upload so the parent can refresh device cards. */
  onUploaded: () => void;
}

// ─── CSV helpers ──────────────────────────────────────────────────────────

function quoteCsv(v: string): string {
  if (v == null) return '';
  const s = String(v);
  // Quote if it contains comma, quote, or newline. Double internal quotes.
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(filename: string, header: string[], rows: string[][]) {
  const lines = [header.map(quoteCsv).join(',')];
  for (const r of rows) lines.push(r.map(quoteCsv).join(','));
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Minimal CSV parser — handles quoted fields, escaped quotes, CRLF/LF.
 * Returns array of objects keyed by the header row (lowercased + trimmed).
 */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { cur.push(field); field = ''; }
      else if (c === '\r') { /* skip */ }
      else if (c === '\n') { cur.push(field); field = ''; rows.push(cur); cur = []; }
      else field += c;
    }
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur); }

  // Drop trailing all-empty rows
  while (rows.length && rows[rows.length - 1].every((v) => v.trim() === '')) rows.pop();
  if (rows.length === 0) return [];

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const out: Record<string, string>[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.every((v) => v.trim() === '')) continue;
    const obj: Record<string, string> = {};
    for (let j = 0; j < header.length; j++) obj[header[j]] = (r[j] ?? '').trim();
    out.push(obj);
  }
  return out;
}

/**
 * Pick the best human-readable identifier to put in the `device` column of an
 * exported CSV. Mirrors the matching order used by the backend bulk-upload
 * endpoint (IP → deviceId → nickname), so a downloaded file will re-upload
 * cleanly without manual editing.
 */
function deviceKey(d: DeviceInfo): string {
  return d.ip || d.deviceId || d.nickname || '';
}

/**
 * Map a task's join-time `progress` field to a 4-state label suitable for
 * an audit CSV. The labels are deliberately concise so they fit in one
 * spreadsheet column:
 *
 *   running  — actively scraping right now
 *   complete — finished (status === 'completed')
 *   stop     — paused / stopped — has partial progress, not actively running
 *   none     — no scrape-tracking record yet, hasn't started
 *
 * Status is read-only — the bulk upload endpoint ignores any `status`
 * column it sees in the CSV.
 */
function taskStatusLabel(t: ScrapeTask): 'running' | 'complete' | 'stop' | 'none' {
  const s = t.progress?.status;
  if (!s) return 'none';
  if (s === 'completed') return 'complete';
  if (s === 'running')   return 'running';
  return 'stop'; // 'paused' | 'stop' | 'stopped'
}

/**
 * Build CSV rows for the given task type by flattening every device's
 * scrapeTasks array. Rows include a `status` column appended after the
 * upload-format columns. The backend bulk-upload endpoint ignores unknown
 * columns, so a downloaded file with `status` will still re-upload cleanly.
 */
function exportRows(devices: DeviceInfo[], type: TaskType): string[][] {
  const rows: string[][] = [];
  for (const d of devices) {
    const key = deviceKey(d);
    if (!key) continue;
    for (const t of d.scrapeTasks || []) {
      if (t.type !== type) continue;
      const status = taskStatusLabel(t);
      if (type === 'range') {
        rows.push([key, String(t.startPin || ''), String(t.endPin || ''), status]);
      } else if (type === 'single') {
        rows.push([key, String(t.startPin || ''), status]);
      } else {
        rows.push([key, String(t.startPin || ''), String(t.jobs ?? 3), status]);
      }
    }
  }
  return rows;
}

/**
 * Combined export — every task across every device, all three types in one
 * CSV. Includes a `status` column for audit. Intended as a full-state
 * backup; not directly re-uploadable through the per-type upload flow
 * since each upload is type-locked.
 *
 * Header: device, type, startPin, endPin, jobs, status
 *   - endPin is empty for `single` and `jobs`
 *   - jobs   is empty for `single` and `range`
 *   - status is running | complete | stop | none
 */
function exportAllRows(devices: DeviceInfo[]): string[][] {
  const rows: string[][] = [];
  for (const d of devices) {
    const key = deviceKey(d);
    if (!key) continue;
    for (const t of d.scrapeTasks || []) {
      const status = taskStatusLabel(t);
      if (t.type === 'range') {
        rows.push([key, 'range', String(t.startPin || ''), String(t.endPin || ''), '', status]);
      } else if (t.type === 'single') {
        rows.push([key, 'single', String(t.startPin || ''), '', '', status]);
      } else if (t.type === 'jobs') {
        rows.push([key, 'jobs', String(t.startPin || ''), '', String(t.jobs ?? 3), status]);
      }
    }
  }
  return rows;
}

/** Headers used when downloading CURRENT (includes `status`). */
const DOWNLOAD_HEADERS: Record<TaskType, string[]> = {
  range:  ['device', 'startPin', 'endPin', 'status'],
  single: ['device', 'startPin', 'status'],
  jobs:   ['device', 'startPin', 'jobs', 'status'],
};

// ─── Per-type config ──────────────────────────────────────────────────────

interface TabConfig {
  type: TaskType;
  label: string;
  description: string;
  headerColumns: string[];
  templateRows: string[][];
  rowToPayload: (row: Record<string, string>) => Record<string, unknown>;
}

const TABS: TabConfig[] = [
  {
    type: 'range',
    label: 'Range',
    description: 'Scrape a continuous block of pincodes. One row per (device, range). Multiple rows for the same device add multiple ranges.',
    headerColumns: ['device', 'startPin', 'endPin'],
    templateRows: [
      ['187.127.165.150', '700001', '700100'],
      ['187.127.165.150', '700200', '700250'],
      ['187.127.165.152', '110001', '110050'],
    ],
    rowToPayload: (r) => ({ device: r.device, startPin: r.startpin, endPin: r.endpin }),
  },
  {
    type: 'single',
    label: 'Single',
    description: 'Scrape exactly one pincode. One row per (device, pincode).',
    headerColumns: ['device', 'startPin'],
    templateRows: [
      ['187.127.165.150', '700001'],
      ['187.127.165.150', '700050'],
      ['187.127.165.152', '110001'],
    ],
    rowToPayload: (r) => ({ device: r.device, startPin: r.startpin }),
  },
  {
    type: 'jobs',
    label: 'Jobs',
    description: 'Start N parallel jobs of 100 pincodes each beginning at startPin. One row per (device, job batch).',
    headerColumns: ['device', 'startPin', 'jobs'],
    templateRows: [
      ['187.127.165.150', '700001', '5'],
      ['187.127.165.150', '710001', '3'],
      ['187.127.165.152', '110001', '10'],
    ],
    rowToPayload: (r) => ({ device: r.device, startPin: r.startpin, jobs: Number(r.jobs) }),
  },
];

// ─── Modal ────────────────────────────────────────────────────────────────

const BulkTasksModal: React.FC<BulkTasksModalProps> = ({ onClose, onUploaded }) => {
  const [activeTab, setActiveTab] = useState<TaskType>('range');
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<BulkResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const devices = useDeviceStore((s) => s.devices);
  const fetchDevices = useDeviceStore((s) => s.fetchDevices);

  const tab = TABS.find((t) => t.type === activeTab)!;

  // Counts of CSV rows that "Download Current" would produce for each tab.
  // Recomputed when devices change so the buttons show live counts.
  const exportCounts = useMemo(() => ({
    range:  exportRows(devices, 'range').length,
    single: exportRows(devices, 'single').length,
    jobs:   exportRows(devices, 'jobs').length,
  }), [devices]);

  const totalAllTasks = exportCounts.range + exportCounts.single + exportCounts.jobs;

  const handleDownloadTemplate = () => {
    downloadCsv(
      `task-template-${tab.type}.csv`,
      tab.headerColumns,
      tab.templateRows,
    );
  };

  const handleDownloadCurrent = async () => {
    // Refresh first so we export the most recent server state, not whatever
    // happened to be cached in the store. Cheap — same call DevicesPage uses.
    try { await fetchDevices(true); } catch { /* fall through with stale data */ }
    const latest = useDeviceStore.getState().devices;
    const rows = exportRows(latest, tab.type);
    if (rows.length === 0) {
      alert(`No ${tab.label} tasks currently configured across any device — nothing to download.`);
      return;
    }
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    downloadCsv(
      `tasks-current-${tab.type}-${ts}.csv`,
      DOWNLOAD_HEADERS[tab.type],
      rows,
    );
  };

  /**
   * Combined export — single CSV with every task across all three types,
   * plus a `status` column (running / complete / stop / none) for audit.
   * Header: device, type, startPin, endPin, jobs, status. Designed as a
   * full-state backup snapshot.
   */
  const handleDownloadAll = async () => {
    try { await fetchDevices(true); } catch { /* fall through */ }
    const latest = useDeviceStore.getState().devices;
    const rows = exportAllRows(latest);
    if (rows.length === 0) {
      alert('No tasks currently configured across any device — nothing to download.');
      return;
    }
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    downloadCsv(
      `tasks-current-all-${ts}.csv`,
      ['device', 'type', 'startPin', 'endPin', 'jobs', 'status'],
      rows,
    );
  };

  const handleUpload = async (file: File) => {
    setResult(null);
    setParseError(null);
    setUploading(true);
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.length === 0) {
        setParseError('CSV has no data rows after the header.');
        return;
      }

      // Verify required columns exist
      const required = tab.headerColumns.map((c) => c.toLowerCase());
      const firstRow = parsed[0];
      const missing = required.filter((c) => !(c in firstRow));
      if (missing.length > 0) {
        setParseError(
          `Missing column(s): ${missing.join(', ')}. ` +
          `Expected header: ${tab.headerColumns.join(', ')}.`
        );
        return;
      }

      const rows = parsed.map(tab.rowToPayload);
      const res = await api.post('/api/admin/devices/bulk-tasks', { type: tab.type, rows });
      const data = res.data as BulkResult;
      setResult(data);
      // Always refresh after a successful HTTP response — even if modifiedCount
      // is 0 (e.g. re-uploading an identical CSV), the matched devices were
      // still persisted. The previous `devicesUpdated > 0` gate caused the
      // page to look frozen when re-uploading a downloaded CSV unchanged.
      const matched = data.devicesMatched ?? data.devicesUpdated;
      if (matched > 0) onUploaded();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string; errors?: string[] } }; message?: string };
      const msg = e?.response?.data?.error || e?.message || 'Upload failed';
      setParseError(msg);
      if (e?.response?.data?.errors) {
        setResult({
          type: tab.type,
          devicesUpdated: 0,
          devicesNotFound: 0,
          rowsAccepted: 0,
          rowsRejected: 0,
          errors: e.response.data.errors,
        });
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-2xl shadow-xl">
        <div className="px-5 py-4 border-b border-slate-800 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-white">Bulk Task Upload</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Each upload <span className="text-red-300">replaces</span> all existing tasks for the matched devices.
              Multiple rows per device build a multi-task list.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleDownloadAll}
              disabled={totalAllTasks === 0}
              title={
                totalAllTasks === 0
                  ? 'No tasks currently configured'
                  : 'Export every device\'s full task list (all 3 types in one CSV) — for backup / audit'
              }
              className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Download All Tasks ({totalAllTasks.toLocaleString()})
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-800 px-5">
          {TABS.map((t) => (
            <button
              key={t.type}
              onClick={() => { setActiveTab(t.type); setResult(null); setParseError(null); }}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === t.type
                  ? 'border-blue-500 text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-slate-300">{tab.description}</p>

          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
            <p className="text-xs text-slate-400 mb-2">Expected CSV header:</p>
            <code className="block bg-black/30 rounded px-2 py-1.5 text-xs font-mono text-blue-300 mb-3">
              {tab.headerColumns.join(', ')}
            </code>
            <p className="text-xs text-slate-500">
              The <code className="text-slate-300">device</code> column accepts an IP address, deviceId, or nickname —
              whichever matches a registered device.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleDownloadTemplate}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium px-3 py-2 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Download {tab.label} Template
            </button>

            <button
              onClick={handleDownloadCurrent}
              disabled={exportCounts[tab.type] === 0}
              title={
                exportCounts[tab.type] === 0
                  ? `No ${tab.label.toLowerCase()} tasks currently configured`
                  : `Export every device's existing ${tab.label.toLowerCase()} tasks as a CSV (can be re-uploaded as-is to restore)`
              }
              className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-6h13M9 11V5l-7 7 7 7v-6" transform="rotate(180 12 12)" />
              </svg>
              Download Current ({exportCounts[tab.type].toLocaleString()})
            </button>

            <label className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-3 py-2 rounded-lg cursor-pointer transition-colors disabled:opacity-50">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              {uploading ? 'Uploading…' : `Upload ${tab.label} CSV`}
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
                  e.target.value = '';
                }}
              />
            </label>
          </div>

          {parseError && (
            <div className="px-3 py-2 rounded bg-red-900/40 border border-red-800/60 text-red-200 text-xs">
              {parseError}
            </div>
          )}

          {result && (
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2">
              {(() => {
                const matched = result.devicesMatched ?? result.devicesUpdated;
                if (matched > 0) {
                  const sameAsBefore = matched - result.devicesUpdated;
                  return (
                    <div className="px-3 py-2 rounded bg-emerald-900/30 border border-emerald-800/60 text-emerald-200 text-xs">
                      <strong>Saved.</strong> {matched.toLocaleString()} device(s) persisted in MongoDB.
                      {sameAsBefore > 0 && (
                        <span className="text-emerald-300/70">
                          {' '}({sameAsBefore.toLocaleString()} had no actual diff — same as before.)
                        </span>
                      )}
                    </div>
                  );
                }
                if (result.devicesNotFound > 0) {
                  return (
                    <div className="px-3 py-2 rounded bg-red-900/40 border border-red-800/60 text-red-200 text-xs">
                      <strong>Nothing saved.</strong> The {result.devicesNotFound.toLocaleString()} `device` value(s)
                      in your CSV didn't match any registered IP, deviceId, or nickname. See the warnings list below.
                    </div>
                  );
                }
                return (
                  <div className="px-3 py-2 rounded bg-yellow-900/30 border border-yellow-800/60 text-yellow-200 text-xs">
                    <strong>Nothing saved.</strong> No valid rows after validation.
                  </div>
                );
              })()}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <Stat label="Devices saved" value={result.devicesMatched ?? result.devicesUpdated} ok={(result.devicesMatched ?? result.devicesUpdated) > 0} />
                <Stat label="Devices not found" value={result.devicesNotFound} bad={result.devicesNotFound > 0} />
                <Stat label="Rows accepted" value={result.rowsAccepted} ok={result.rowsAccepted > 0} />
                <Stat label="Rows rejected" value={result.rowsRejected} bad={result.rowsRejected > 0} />
              </div>
              {result.errors.length > 0 && (
                <details className="text-xs">
                  <summary className="text-yellow-300 cursor-pointer">
                    {result.errors.length} warning(s) — click to expand
                  </summary>
                  <ul className="mt-2 max-h-32 overflow-y-auto space-y-1 pl-4 text-yellow-200/80">
                    {result.errors.slice(0, 100).map((err, i) => (
                      <li key={i} className="list-disc">{err}</li>
                    ))}
                    {result.errors.length > 100 && (
                      <li className="text-slate-500">…and {result.errors.length - 100} more</li>
                    )}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="text-sm text-slate-300 hover:text-white px-3 py-2 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: number; ok?: boolean; bad?: boolean }> = ({ label, value, ok, bad }) => (
  <div className="bg-slate-900 border border-slate-800 rounded px-2 py-1.5">
    <div className={`text-base font-bold ${bad ? 'text-red-300' : ok ? 'text-emerald-300' : 'text-slate-200'}`}>
      {value.toLocaleString()}
    </div>
    <div className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</div>
  </div>
);

export default BulkTasksModal;
