import React, { useState } from 'react';
import type { SessionState } from '../types';

interface SessionCardProps {
  session: SessionState;
  onStop: (id: string) => void;
  onRetryExcel: (id: string) => void;
  onClick: (id: string) => void;
  onOpenPopup?: (id: string) => void;
}

const statusColors: Record<string, string> = {
  running: 'bg-green-500',
  paused: 'bg-yellow-400',
  completed: 'bg-blue-500',
  error: 'bg-red-500',
  stopping: 'bg-orange-400',
};

const statusLabels: Record<string, string> = {
  running: 'Running',
  paused: 'Paused',
  completed: 'Completed',
  error: 'Error',
  stopping: 'Stopping...',
};

const SessionCard: React.FC<SessionCardProps> = ({ session, onStop, onRetryExcel, onClick, onOpenPopup }) => {
  const dotColor = statusColors[session.status] ?? 'bg-slate-400';
  const label = statusLabels[session.status] ?? session.status;
  const isActive = session.status === 'running' || session.status === 'paused';
  const duration = session.endTime
    ? Math.round((new Date(session.endTime).getTime() - new Date(session.startTime).getTime()) / 1000)
    : Math.round((Date.now() - new Date(session.startTime).getTime()) / 1000);

  const [downloading, setDownloading] = useState(false);
  const [downloadMsg, setDownloadMsg] = useState('');

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setDownloading(true);
    setDownloadMsg('');
    const result = await window.electronAPI.downloadExcel(session.id);
    setDownloading(false);
    if (result.success) {
      setDownloadMsg('Saved!');
      setTimeout(() => setDownloadMsg(''), 3000);
    } else {
      setDownloadMsg(result.error ?? 'Failed');
      setTimeout(() => setDownloadMsg(''), 4000);
    }
  };

  return (
    <div
      className="bg-slate-800 border border-slate-700 rounded-xl p-4 cursor-pointer hover:border-slate-500 transition-all group"
      onClick={() => onClick(session.id)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${dotColor} ${isActive ? 'animate-pulse' : ''}`} />
            <span className="text-sm font-semibold text-white truncate">{session.keyword}</span>
          </div>
          <div className="text-xs text-slate-400 font-mono mb-2">ID: {session.id.substring(0, 12)}…</div>
          {session.totalUrls != null && session.totalUrls > 0 ? (
            /* Tabs mode: show Total / Scraped / Due / Duration */
            <div className="grid grid-cols-4 gap-1.5 text-center">
              <div className="bg-slate-900 rounded-lg p-2">
                <div className="text-base font-bold text-blue-400">{session.totalUrls}</div>
                <div className="text-xs text-slate-400">Total</div>
              </div>
              <div className="bg-slate-900 rounded-lg p-2">
                <div className="text-base font-bold text-green-400">{session.totalScraped}</div>
                <div className="text-xs text-slate-400">Scraped</div>
              </div>
              <div className="bg-slate-900 rounded-lg p-2">
                <div className="text-base font-bold text-yellow-400">
                  {Math.max(0, session.totalUrls - session.totalScraped)}
                </div>
                <div className="text-xs text-slate-400">Due</div>
              </div>
              <div className="bg-slate-900 rounded-lg p-2">
                <div className="text-base font-bold text-white">{duration}s</div>
                <div className="text-xs text-slate-400">Duration</div>
              </div>
            </div>
          ) : (
            /* Feed mode or collecting URLs: existing 3-stat layout */
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-slate-900 rounded-lg p-2">
                <div className="text-lg font-bold text-white">{session.totalScraped}</div>
                <div className="text-xs text-slate-400">Scraped</div>
              </div>
              <div className="bg-slate-900 rounded-lg p-2">
                <div className="text-lg font-bold text-white">{session.batchesSent}</div>
                <div className="text-xs text-slate-400">Batches</div>
              </div>
              <div className="bg-slate-900 rounded-lg p-2">
                <div className="text-lg font-bold text-white">{duration}s</div>
                <div className="text-xs text-slate-400">Duration</div>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <span className={`text-xs px-2 py-1 rounded-full font-medium text-white ${dotColor}`}>{label}</span>
          {isActive && onOpenPopup && (
            <button
              onClick={(e) => { e.stopPropagation(); onOpenPopup(session.id); }}
              className="text-xs bg-blue-700 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg transition-colors"
            >
              Live View
            </button>
          )}
          {isActive && (
            <button
              onClick={(e) => { e.stopPropagation(); onStop(session.id); }}
              className="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg transition-colors"
            >
              Stop
            </button>
          )}
          {session.status === 'completed' && session.excelPath && (
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="text-xs bg-green-700 hover:bg-green-600 disabled:bg-green-900 text-white px-3 py-1.5 rounded-lg transition-colors"
            >
              {downloading
                ? '…'
                : downloadMsg === 'Saved!'
                ? 'Saved'
                : downloadMsg
                ? 'Failed'
                : 'Download'}
            </button>
          )}
          {session.status === 'completed' && !session.excelSent && session.excelPath && (
            <button
              onClick={(e) => { e.stopPropagation(); onRetryExcel(session.id); }}
              className="text-xs bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1.5 rounded-lg transition-colors"
            >
              Retry Excel
            </button>
          )}
        </div>
      </div>

      {session.errorMessage && session.status === 'error' && (
        <div className="mt-2 text-xs text-red-400 bg-red-900/20 border border-red-800 rounded p-2 break-words line-clamp-3" title={session.errorMessage}>
          {session.errorMessage}
        </div>
      )}
      {session.errorMessage && session.status === 'completed' && !session.excelSent && (
        <div className="mt-2 text-xs text-yellow-500/80 bg-yellow-900/10 border border-yellow-900/40 rounded p-2 break-words line-clamp-2" title={session.errorMessage}>
          {session.errorMessage}
        </div>
      )}
      {downloadMsg && downloadMsg !== 'Saved!' && (
        <div className="mt-2 text-xs text-red-400">{downloadMsg}</div>
      )}

      {session.status === 'completed' && (
        <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
          <span className={session.excelSent ? 'text-green-400' : 'text-yellow-400'}>
            {session.excelSent ? 'Excel sent' : 'Excel not sent'}
          </span>
          {session.totalScraped > 0 && (
            <span className="text-slate-500">· Click to view all records</span>
          )}
        </div>
      )}
      {isActive && session.totalScraped > 0 && (
        <div className="mt-2 text-xs text-slate-500">· Click to view live data</div>
      )}
    </div>
  );
};

export default SessionCard;
