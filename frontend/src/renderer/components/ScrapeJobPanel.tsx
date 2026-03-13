import React, { useState } from 'react';
import { ScrapeJobState } from '../../shared/types';

interface ScrapeJobPanelProps {
  job: ScrapeJobState;
  onPause: (jobId: string) => void;
  onResume: (jobId: string) => void;
  onStop: (jobId: string) => void;
}

const STATUS_DOT: Record<string, string> = {
  running: 'bg-green-400 animate-pulse',
  paused: 'bg-yellow-400',
  completed: 'bg-blue-400',
  stopped: 'bg-red-500',
  loading: 'bg-slate-400 animate-pulse',
  idle: 'bg-slate-500',
};

const STATUS_TEXT: Record<string, string> = {
  running: 'text-green-400',
  paused: 'text-yellow-400',
  completed: 'text-blue-400',
  stopped: 'text-red-400',
  loading: 'text-slate-400',
  idle: 'text-slate-400',
};

const ScrapeJobPanel: React.FC<ScrapeJobPanelProps> = ({ job, onPause, onResume, onStop }) => {
  const [busy, setBusy] = useState(false);

  const progressPct =
    job.totalSearches > 0 ? Math.round((job.completedSearches / job.totalSearches) * 100) : 0;

  // Safe array access with bounds checking
  const currentPincode =
    job.pincodeIndex >= 0 && job.pincodeIndex < job.pincodes.length
      ? job.pincodes[job.pincodeIndex]
      : null;
  const currentNiche =
    job.nicheIndex >= 0 && job.nicheIndex < job.niches.length
      ? job.niches[job.nicheIndex]
      : null;

  const isRunning = job.status === 'running';
  const isPaused = job.status === 'paused';
  const isCompleted = job.status === 'completed';
  const isStopped = job.status === 'stopped';

  const handlePause = async () => {
    setBusy(true);
    try { await onPause(job.jobId); } finally { setBusy(false); }
  };

  const handleResume = async () => {
    setBusy(true);
    try { await onResume(job.jobId); } finally { setBusy(false); }
  };

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[job.status] ?? 'bg-slate-400'}`} />
          <h3 className="text-sm font-semibold text-white">Pincode Range Job</h3>
          <span className={`text-xs font-medium ${STATUS_TEXT[job.status] ?? 'text-slate-400'}`}>
            {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
          </span>
        </div>
        <span className="text-xs text-slate-400">
          Pin {job.startPincode} → {job.endPincode}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-slate-400 mb-1.5">
          <span>{job.completedSearches.toLocaleString()} / {job.totalSearches.toLocaleString()} searches</span>
          <span>{progressPct}%</span>
        </div>
        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Current position */}
      {!isCompleted && !isStopped && currentPincode && currentNiche && (
        <div className="mb-4 bg-slate-800 rounded-lg px-4 py-3 space-y-1">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span className="text-slate-400">
              Pin: <span className="text-white font-medium">{currentPincode.Pincode}</span>
              <span className="text-slate-500"> ({currentPincode.District}, {currentPincode.StateName})</span>
            </span>
            <span className="text-slate-400">
              Round: <span className="text-white font-medium">{job.round}/3</span>
            </span>
            <span className="text-slate-400">
              Niche: <span className="text-white font-medium">{job.nicheIndex + 1}/{job.niches.length}</span>
            </span>
          </div>
          <p
            className="text-xs text-slate-500 truncate"
            title={`get all ${currentNiche.SubCategory} (${currentNiche.Category}) from ${currentPincode.District}, ${currentPincode.StateName}, Pin - ${currentPincode.Pincode}`}
          >
            {currentNiche.SubCategory} ({currentNiche.Category})
          </p>
        </div>
      )}

      {/* Completed summary */}
      {isCompleted && (
        <div className="mb-4 bg-blue-500/10 border border-blue-500/30 rounded-lg px-4 py-3">
          <p className="text-sm text-blue-300 font-medium">Job completed!</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {job.completedSearches.toLocaleString()} searches across{' '}
            {job.pincodes.length} pincodes × {job.niches.length} niches × 3 rounds
          </p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        {isRunning && (
          <button
            onClick={handlePause}
            disabled={busy}
            className="flex-1 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-60 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {busy ? 'Pausing…' : 'Pause'}
          </button>
        )}
        {isPaused && (
          <button
            onClick={handleResume}
            disabled={busy}
            className="flex-1 bg-green-600 hover:bg-green-500 disabled:opacity-60 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {busy ? 'Resuming…' : 'Resume'}
          </button>
        )}
        {(isRunning || isPaused) && (
          <button
            onClick={() => onStop(job.jobId)}
            disabled={busy}
            className="bg-red-600/20 hover:bg-red-600/40 disabled:opacity-60 text-red-400 hover:text-red-300 text-xs font-medium px-4 py-2 rounded-lg transition-colors border border-red-600/30"
          >
            Stop
          </button>
        )}
        {(isCompleted || isStopped) && (
          <button
            onClick={() => onStop(job.jobId)}
            className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
};

export default ScrapeJobPanel;
