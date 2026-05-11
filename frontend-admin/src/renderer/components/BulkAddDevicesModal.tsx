import React, { useState } from 'react';
import api from '../lib/api';

interface BulkAddResult {
  created: number;
  updated: number;
  rowsAccepted: number;
  rowsRejected: number;
  errors: string[];
}

interface BulkAddDevicesModalProps {
  onClose: () => void;
  /** Called after a successful upload so the parent can refresh device cards. */
  onAdded: () => void;
}

// ─── CSV helpers (shared format with BulkTasksModal but kept local) ──────

function quoteCsv(v: string): string {
  if (v == null) return '';
  const s = String(v);
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
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { cur.push(field); field = ''; }
      else if (c === '\r') { /* skip */ }
      else if (c === '\n') { cur.push(field); field = ''; rows.push(cur); cur = []; }
      else field += c;
    }
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur); }
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

// ─── Template + headers ──────────────────────────────────────────────────

const HEADER = ['ip', 'password', 'startPin', 'jobs'];

const TEMPLATE_ROWS: string[][] = [
  ['187.127.165.150', 'CHANGE_ME_PASSWORD', '700001', '3'],
  ['187.127.165.151', 'CHANGE_ME_PASSWORD', '700001', '5'],
  ['187.127.165.152', 'CHANGE_ME_PASSWORD', '110001', '10'],
];

// ─── Modal ───────────────────────────────────────────────────────────────

const BulkAddDevicesModal: React.FC<BulkAddDevicesModalProps> = ({ onClose, onAdded }) => {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<BulkAddResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const handleDownloadTemplate = () => {
    downloadCsv('devices-add-template.csv', HEADER, TEMPLATE_ROWS);
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

      // Verify required columns exist (only `ip` is mandatory)
      const firstRow = parsed[0];
      if (!('ip' in firstRow)) {
        setParseError(
          `Missing required column: ip. Expected header: ${HEADER.join(', ')}.`
        );
        return;
      }

      const rows = parsed.map((r) => ({
        ip: r.ip,
        password: r.password ?? '',
        startPin: r.startpin ?? '',
        jobs: r.jobs ?? '',
      }));

      const res = await api.post('/api/admin/devices/bulk-add', { rows });
      const data = res.data as BulkAddResult;
      setResult(data);
      if ((data.created + data.updated) > 0) onAdded();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string; errors?: string[] } }; message?: string };
      const msg = e?.response?.data?.error || e?.message || 'Upload failed';
      setParseError(msg);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-2xl shadow-xl">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-white">Bulk Add Devices</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Upload a CSV to register many VPS devices at once.
              Rows for IPs already in the system <span className="text-yellow-300">update</span> the
              password/startPin/jobs on the existing record (deviceId unchanged).
            </p>
          </div>
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

        <div className="px-5 py-4 space-y-4">
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
            <p className="text-xs text-slate-400 mb-2">Expected CSV header:</p>
            <code className="block bg-black/30 rounded px-2 py-1.5 text-xs font-mono text-blue-300 mb-3">
              {HEADER.join(', ')}
            </code>
            <ul className="text-xs text-slate-500 space-y-1">
              <li><strong className="text-slate-300">ip</strong> — required. IPv4 (e.g. <code>187.127.165.150</code>).</li>
              <li><strong className="text-slate-300">password</strong> — optional. VPS root password for SSH access. Updates if blank-vs-set differs.</li>
              <li><strong className="text-slate-300">startPin</strong> — optional. 6-digit pincode (100000-999999). Stored as the device's default scrapePincode.</li>
              <li><strong className="text-slate-300">jobs</strong> — optional. Default 3. Integer 1-999. Stored as the device's default scrapeJobs.</li>
            </ul>
            <p className="text-xs text-yellow-300/70 mt-2">
              Tip: scrapeTasks (multi-task list) is not set here — use the
              <strong className="text-white"> Bulk Tasks</strong> button after the devices are registered.
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
              Download Template
            </button>

            <label className="flex items-center gap-1.5 bg-green-600 hover:bg-green-500 text-white text-sm font-medium px-3 py-2 rounded-lg cursor-pointer transition-colors disabled:opacity-50">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              {uploading ? 'Uploading…' : 'Upload Devices CSV'}
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
                const total = result.created + result.updated;
                if (total > 0) {
                  return (
                    <div className="px-3 py-2 rounded bg-emerald-900/30 border border-emerald-800/60 text-emerald-200 text-xs">
                      <strong>Saved.</strong> {result.created.toLocaleString()} created, {result.updated.toLocaleString()} updated.
                    </div>
                  );
                }
                return (
                  <div className="px-3 py-2 rounded bg-yellow-900/30 border border-yellow-800/60 text-yellow-200 text-xs">
                    <strong>Nothing saved.</strong> {result.rowsRejected.toLocaleString()} row(s) rejected — see warnings below.
                  </div>
                );
              })()}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <Stat label="Created" value={result.created} ok={result.created > 0} />
                <Stat label="Updated" value={result.updated} ok={result.updated > 0} />
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

export default BulkAddDevicesModal;
