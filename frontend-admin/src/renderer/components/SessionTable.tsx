import React, { useState } from 'react';
import type { SessionStatsRecord } from '../../shared/types';
import SessionDetailModal from './SessionDetailModal';

function formatDuration(ms?: number): string {
  if (!ms) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    completed: 'bg-green-500/20 text-green-400',
    error: 'bg-red-500/20 text-red-400',
    partial: 'bg-yellow-500/20 text-yellow-400',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[status] || 'bg-slate-700 text-slate-300'}`}>
      {status}
    </span>
  );
}

interface SessionTableProps {
  sessions: SessionStatsRecord[];
  showDevice?: boolean;
}

const SessionTable: React.FC<SessionTableProps> = ({ sessions, showDevice = true }) => {
  const [selected, setSelected] = useState<SessionStatsRecord | null>(null);

  if (sessions.length === 0) {
    return <p className="text-sm text-slate-500 py-8 text-center">No sessions found.</p>;
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-400 border-b border-slate-800">
              <th className="text-left py-3 px-3 font-medium">Keyword</th>
              {showDevice && <th className="text-left py-3 px-3 font-medium">Device</th>}
              <th className="text-right py-3 px-3 font-medium">Records</th>
              <th className="text-right py-3 px-3 font-medium">Inserted</th>
              <th className="text-right py-3 px-3 font-medium">Dupes</th>
              <th className="text-center py-3 px-3 font-medium">Status</th>
              <th className="text-right py-3 px-3 font-medium">Duration</th>
              <th className="text-right py-3 px-3 font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr
                key={s._id}
                onClick={() => setSelected(s)}
                className="border-b border-slate-800/50 hover:bg-slate-800/60 cursor-pointer transition-colors"
              >
                <td className="py-2.5 px-3 text-slate-200 max-w-[300px] truncate">
                  {s.keyword || '—'}
                </td>
                {showDevice && (
                  <td className="py-2.5 px-3 text-slate-300 text-xs font-medium">
                    {s.deviceName || (s.deviceId ? s.deviceId.slice(0, 8) + '…' : '—')}
                  </td>
                )}
                <td className="py-2.5 px-3 text-right text-slate-300">{s.totalRecords}</td>
                <td className="py-2.5 px-3 text-right text-green-400">{s.insertedRecords}</td>
                <td className="py-2.5 px-3 text-right text-yellow-400">{s.duplicateRecords}</td>
                <td className="py-2.5 px-3 text-center">{statusBadge(s.status)}</td>
                <td className="py-2.5 px-3 text-right text-slate-400">{formatDuration(s.durationMs)}</td>
                <td className="py-2.5 px-3 text-right text-slate-500 text-xs">
                  {new Date(s.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <SessionDetailModal session={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
};

export default SessionTable;
