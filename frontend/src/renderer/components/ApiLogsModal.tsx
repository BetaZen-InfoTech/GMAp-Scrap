import React, { useEffect, useState } from 'react';
import type { ApiLogEntry } from '../types';

interface ApiLogsModalProps {
  open: boolean;
  onClose: () => void;
}

const ApiLogsModal: React.FC<ApiLogsModalProps> = ({ open, onClose }) => {
  const [logs, setLogs] = useState<ApiLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'batch' | 'excel'>('all');
  const [showErrors, setShowErrors] = useState(false);
  const [clearing, setClearing] = useState(false);

  const load = async () => {
    setLoading(true);
    const entries = await window.electronAPI.getApiLogs();
    setLogs(entries);
    setLoading(false);
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  if (!open) return null;

  const filtered = logs.filter((l) => {
    if (filter !== 'all' && l.type !== filter) return false;
    if (showErrors && l.success) return false;
    return true;
  });

  const handleClear = async () => {
    setClearing(true);
    await window.electronAPI.clearApiLogs();
    setLogs([]);
    setClearing(false);
  };

  const successCount = logs.filter((l) => l.success).length;
  const failCount = logs.filter((l) => !l.success).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-5xl mx-4 flex flex-col shadow-2xl"
           style={{ height: '85vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 flex-shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-bold text-white">API Call Logs</h2>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-green-400 bg-green-900/30 border border-green-800 px-2 py-0.5 rounded-full">
                {successCount} ok
              </span>
              <span className="text-red-400 bg-red-900/30 border border-red-800 px-2 py-0.5 rounded-full">
                {failCount} failed
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              className="text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors"
            >Refresh</button>
            <button
              onClick={handleClear}
              disabled={clearing}
              className="text-xs text-red-400 hover:text-red-300 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >{clearing ? 'Clearing…' : 'Clear All'}</button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-sm rounded-lg transition-colors"
            >Close</button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-slate-800 flex-shrink-0">
          <div className="flex gap-1">
            {(['all', 'batch', 'excel'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                  filter === f ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700'
                }`}
              >
                {f === 'all' ? 'All' : f === 'batch' ? 'Batch JSON' : 'Excel Upload'}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showErrors}
              onChange={(e) => setShowErrors(e.target.checked)}
              className="w-3 h-3 accent-red-500"
            />
            Errors only
          </label>
          <span className="text-xs text-slate-500 ml-auto">{filtered.length} entries</span>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-full text-slate-400 text-sm">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
              <div className="text-3xl mb-2">📋</div>
              <p className="text-sm">No log entries found.</p>
            </div>
          ) : (
            <table className="w-full text-xs min-w-max">
              <thead className="sticky top-0 bg-slate-800 border-b border-slate-700 z-10">
                <tr>
                  <th className="text-left px-4 py-3 text-slate-400 font-semibold w-36">Time</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-semibold w-20">Type</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-semibold">Endpoint</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-semibold w-24">Keyword</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-semibold w-16">Status</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-semibold w-20">Time (ms)</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-semibold w-16">Attempt</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-semibold w-16">Records</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-semibold">Result / Error</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((log, i) => (
                  <tr key={i} className={`border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors ${!log.success ? 'bg-red-900/10' : ''}`}>
                    <td className="px-4 py-2 text-slate-400 font-mono whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                        log.type === 'batch' ? 'bg-green-900/40 text-green-400' : 'bg-purple-900/40 text-purple-400'
                      }`}>
                        {log.type === 'batch' ? 'Batch' : 'Excel'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-300 max-w-[200px] truncate font-mono text-xs" title={log.endpoint}>
                      {log.endpoint}
                    </td>
                    <td className="px-4 py-2 text-slate-300 max-w-[100px] truncate" title={log.keyword}>
                      {log.keyword || '—'}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {log.statusCode ? (
                        <span className={log.success ? 'text-green-400' : 'text-red-400'}>
                          {log.statusCode}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-2 text-right text-slate-300">{log.responseTimeMs}</td>
                    <td className="px-4 py-2 text-right text-slate-400">{log.attempt}</td>
                    <td className="px-4 py-2 text-right text-slate-400">
                      {log.recordCount != null ? log.recordCount : '—'}
                    </td>
                    <td className="px-4 py-2 max-w-[220px]">
                      {log.success ? (
                        <span className="text-green-400">OK</span>
                      ) : (
                        <span className="text-red-400 truncate block" title={log.error}>{log.error}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default ApiLogsModal;
