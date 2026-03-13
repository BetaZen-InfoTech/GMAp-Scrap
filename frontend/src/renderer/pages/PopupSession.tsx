import React, { useEffect, useState } from 'react';
import type { SessionState, BatchSentPayload, CompletePayload } from '../types';
import ProgressBar from '../components/ProgressBar';

interface LogEntry {
  type: 'info' | 'success' | 'error' | 'batch';
  message: string;
  time: string;
}

interface PopupSessionProps {
  sessionId: string;
}

const PopupSession: React.FC<PopupSessionProps> = ({ sessionId }) => {
  const [session, setSession] = useState<SessionState | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stopping, setStopping] = useState(false);

  const addLog = (type: LogEntry['type'], message: string) => {
    setLogs((prev) => [
      ...prev.slice(-199), // keep last 200 logs
      { type, message, time: new Date().toLocaleTimeString() },
    ]);
  };

  useEffect(() => {
    // Retry up to 6×500ms in case the session hasn't been registered yet
    let attempts = 0;
    const tryLoad = () => {
      window.electronAPI.getSession(sessionId).then((s) => {
        if (s) {
          setSession(s);
        } else if (attempts < 6) {
          attempts++;
          setTimeout(tryLoad, 500);
        } else {
          setLoadError(true);
        }
      }).catch(() => setLoadError(true));
    };
    tryLoad();

    const offProgress = window.electronAPI.onProgress((payload) => {
      if (payload.sessionId !== sessionId) return;
      setSession((prev) => prev ? {
        ...prev,
        totalScraped: payload.totalScraped,
        status: payload.status,
        errorMessage: payload.errorMessage,
        records: payload.record ? [...prev.records, payload.record] : prev.records,
      } : prev);

      if (payload.record) {
        addLog('info', `Scraped: ${payload.record.name} — ${payload.record.address || 'no address'}`);
      }
      if (payload.status === 'error') {
        addLog('error', `Error: ${payload.errorMessage}`);
      }
    });

    const offBatch = window.electronAPI.onBatchSent((payload: BatchSentPayload) => {
      if (payload.sessionId !== sessionId) return;
      setSession((prev) => prev ? {
        ...prev,
        batchesSent: payload.success ? prev.batchesSent + 1 : prev.batchesSent,
      } : prev);
      if (payload.success) {
        addLog('batch', `Batch #${payload.batchNumber} sent (${payload.count} records)`);
      } else {
        addLog('error', `Batch #${payload.batchNumber} failed: ${payload.error}`);
      }
    });

    const offComplete = window.electronAPI.onComplete((payload: CompletePayload) => {
      if (payload.sessionId !== sessionId) return;
      setSession((prev) => prev ? {
        ...prev,
        status: 'completed',
        totalScraped: payload.totalScraped,
        excelSent: payload.excelSent,
        excelPath: payload.excelPath,
      } : prev);

      if (payload.excelPath) {
        addLog('success', `Excel saved: ${payload.excelPath}`);
      }
      if (payload.excelSent) {
        addLog('success', 'Excel file sent to API successfully');
      } else if (payload.error) {
        addLog('error', `Excel send failed: ${payload.error}`);
      }
      addLog('success', `Session complete — ${payload.totalScraped} records scraped`);
    });

    return () => {
      offProgress();
      offBatch();
      offComplete();
    };
  }, [sessionId]);

  const handleStop = async () => {
    setStopping(true);
    addLog('info', 'Stopping session…');
    await window.electronAPI.stopScrape({ sessionId });
  };

  const handleRetryExcel = async () => {
    addLog('info', 'Retrying Excel upload…');
    await window.electronAPI.retryExcelSend(sessionId);
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        {loadError ? (
          <div className="text-center">
            <p className="text-red-400 text-sm mb-3">Session not found or failed to load.</p>
            <button
              onClick={() => window.close()}
              className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-lg transition-colors"
            >
              Close Window
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading session…
          </div>
        )}
      </div>
    );
  }

  const isActive = session.status === 'running' || session.status === 'paused';
  const latestRecords = [...session.records].reverse().slice(0, 20);

  const statusColors: Record<string, string> = {
    running: 'text-green-400',
    paused: 'text-yellow-400',
    completed: 'text-blue-400',
    error: 'text-red-400',
    stopping: 'text-orange-400',
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-5 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold text-white truncate max-w-xs">{session.keyword}</h1>
            <div className="text-xs text-slate-500 font-mono">{session.id}</div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs font-medium ${statusColors[session.status] ?? 'text-slate-400'}`}>
              {session.status.toUpperCase()}
              {isActive && <span className="ml-1 animate-pulse">●</span>}
            </span>
            {isActive && !stopping && (
              <button
                onClick={handleStop}
                className="bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-1.5 rounded-lg transition-colors"
              >
                Stop
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Stats */}
      <div className="bg-slate-900 border-b border-slate-800 px-5 py-3 grid grid-cols-4 gap-3">
        {[
          { label: 'Scraped', value: session.totalScraped },
          { label: 'Batches Sent', value: session.batchesSent },
          { label: 'Records (UI)', value: session.records.length },
          { label: 'Excel Sent', value: session.excelSent ? 'Yes' : 'No' },
        ].map(({ label, value }) => (
          <div key={label} className="text-center">
            <div className="text-xl font-bold text-white">{value}</div>
            <div className="text-xs text-slate-400">{label}</div>
          </div>
        ))}
      </div>

      <div className="flex-1 flex gap-0 overflow-hidden">
        {/* Records Table */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Latest Records
          </div>
          <div className="flex-1 overflow-y-auto">
            {latestRecords.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-slate-500 text-sm">
                Waiting for data…
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-900 border-b border-slate-800">
                  <tr>
                    <th className="text-left px-4 py-2 text-slate-400 font-medium">Name</th>
                    <th className="text-left px-4 py-2 text-slate-400 font-medium">Address</th>
                    <th className="text-left px-4 py-2 text-slate-400 font-medium">Phone</th>
                    <th className="text-left px-4 py-2 text-slate-400 font-medium">Rating</th>
                    <th className="text-left px-4 py-2 text-slate-400 font-medium">Category</th>
                  </tr>
                </thead>
                <tbody>
                  {latestRecords.map((r, i) => (
                    <tr key={`${r.mapsUrl}-${i}`} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                      <td className="px-4 py-2 text-white max-w-[160px] truncate">{r.name}</td>
                      <td className="px-4 py-2 text-slate-300 max-w-[180px] truncate">{r.address}</td>
                      <td className="px-4 py-2 text-slate-300">{r.phone}</td>
                      <td className="px-4 py-2 text-yellow-400">{r.rating > 0 ? `★ ${r.rating}` : '—'}</td>
                      <td className="px-4 py-2 text-slate-400 max-w-[120px] truncate">{r.category}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Log Panel */}
        <div className="w-72 border-l border-slate-800 flex flex-col bg-slate-900/50">
          <div className="px-4 py-3 border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Activity Log
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1 font-mono">
            {logs.length === 0 ? (
              <div className="text-xs text-slate-500 text-center mt-8">No activity yet…</div>
            ) : (
              [...logs].reverse().map((log, i) => {
                const colors: Record<string, string> = {
                  info: 'text-slate-400',
                  success: 'text-green-400',
                  error: 'text-red-400',
                  batch: 'text-blue-400',
                };
                return (
                  <div key={i} className={`text-xs ${colors[log.type]}`}>
                    <span className="text-slate-600">[{log.time}] </span>
                    {log.message}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      {session.status === 'completed' && (
        <div className="bg-slate-900 border-t border-slate-800 px-5 py-3 flex items-center justify-between">
          <div className="text-sm text-slate-300">
            Session complete — {session.totalScraped} records scraped
            {session.excelPath && (
              <span className="ml-2 text-xs text-slate-500 font-mono">{session.excelPath}</span>
            )}
          </div>
          {!session.excelSent && session.excelPath && (
            <button
              onClick={handleRetryExcel}
              className="bg-yellow-600 hover:bg-yellow-700 text-white text-xs px-4 py-2 rounded-lg transition-colors"
            >
              Retry Excel Upload
            </button>
          )}
        </div>
      )}

      {session.errorMessage && session.status === 'error' && (
        <div className="bg-red-900/20 border-t border-red-800 px-5 py-3 text-xs text-red-400">
          Error: {session.errorMessage}
        </div>
      )}
    </div>
  );
};

export default PopupSession;
