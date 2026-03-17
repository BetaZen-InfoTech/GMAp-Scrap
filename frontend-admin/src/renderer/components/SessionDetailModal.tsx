import React, { useState } from 'react';
import type { SessionStatsRecord } from '../../shared/types';
import SessionRecordsModal from './SessionRecordsModal';

function formatDuration(ms?: number): string {
  if (!ms) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatDateTime(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    completed: 'bg-green-500/20 text-green-400 border border-green-500/30',
    error:     'bg-red-500/20 text-red-400 border border-red-500/30',
    partial:   'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  };
  return (
    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${styles[status] || 'bg-slate-700 text-slate-300'}`}>
      {status}
    </span>
  );
}

interface Row {
  label: string;
  value: React.ReactNode;
}

function InfoRow({ label, value }: Row) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-slate-800/60 last:border-0">
      <span className="text-xs text-slate-500 whitespace-nowrap">{label}</span>
      <span className="text-xs text-slate-200 text-right break-all">{value ?? '—'}</span>
    </div>
  );
}

interface Props {
  session: SessionStatsRecord;
  onClose: () => void;
}

const SessionDetailModal: React.FC<Props> = ({ session: s, onClose }) => {
  const [showRecords, setShowRecords] = useState(false);

  // Close on backdrop click
  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={handleBackdrop}
    >
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div>
            <h2 className="text-sm font-semibold text-white">Session Detail</h2>
            <p className="text-xs text-slate-500 mt-0.5 font-mono">{s.sessionId}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white transition-colors text-xl leading-none px-1"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-5 py-2 flex-1">

          {/* Status + Stats */}
          <div className="grid grid-cols-4 gap-3 py-4 border-b border-slate-800">
            <div className="text-center">
              <p className="text-lg font-bold text-slate-100">{s.totalRecords}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Records</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-green-400">{s.insertedRecords}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Inserted</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-yellow-400">{s.duplicateRecords}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Dupes</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-blue-400">{s.batchesSent}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Batches</p>
            </div>
          </div>

          {/* Status row */}
          <div className="flex items-center justify-between py-3 border-b border-slate-800">
            <span className="text-xs text-slate-500">Status</span>
            <div className="flex items-center gap-3">
              {statusBadge(s.status)}
              <span className="text-xs text-slate-400">{formatDuration(s.durationMs)}</span>
              {s.excelUploaded && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  Excel ✓
                </span>
              )}
            </div>
          </div>

          {/* Keyword section */}
          <div className="py-3 border-b border-slate-800">
            <p className="text-[10px] text-slate-500 mb-1">Keyword</p>
            <p className="text-xs text-slate-200 leading-relaxed">{s.keyword || '—'}</p>
          </div>

          {/* Details */}
          <div className="pt-1">
            <InfoRow label="Category"    value={s.category} />
            <InfoRow label="Sub-Category" value={s.subCategory} />
            <InfoRow label="Round"       value={s.round} />
            <InfoRow label="Pincode"     value={s.pincode} />
            <InfoRow label="District"    value={s.district} />
            <InfoRow label="State"       value={s.stateName} />
            <InfoRow label="Device"      value={s.deviceName || s.deviceId} />
            <InfoRow label="Job ID"      value={s.jobId ? <span className="font-mono">{s.jobId.slice(0, 16)}…</span> : '—'} />
            <InfoRow label="Started At"  value={formatDateTime(s.startedAt)} />
            <InfoRow label="Completed At" value={formatDateTime(s.completedAt)} />
            <InfoRow label="Created At"  value={formatDateTime(s.createdAt)} />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 flex gap-2">
          <button
            onClick={() => setShowRecords(true)}
            className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
          >
            View Records
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
          >
            Close
          </button>
        </div>

      </div>

      {showRecords && (
        <SessionRecordsModal session={s} onClose={() => setShowRecords(false)} />
      )}
    </div>
  );
};

export default SessionDetailModal;
