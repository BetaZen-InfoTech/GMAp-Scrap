import React from 'react';
import type { ScrapeJob } from '../../shared/types';

function statusBadge(status: string) {
  const map: Record<string, string> = {
    running:   'bg-blue-500/20 text-blue-400 border border-blue-500/30',
    paused:    'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
    completed: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
    stop:      'bg-red-500/20 text-red-400 border border-red-500/30',
    stopped:   'bg-red-500/20 text-red-400 border border-red-500/30',
  };
  const dot: Record<string, string> = {
    running:   'bg-blue-400 animate-pulse',
    paused:    'bg-yellow-400',
    completed: 'bg-emerald-400',
    stop:      'bg-red-400',
    stopped:   'bg-red-400',
  };
  const labelMap: Record<string, string> = { stop: 'Stop', stopped: 'Stop' };
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full ${map[status] || 'bg-slate-700 text-slate-300'}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot[status] || 'bg-slate-400'}`} />
      {labelMap[status] ?? (status.charAt(0).toUpperCase() + status.slice(1))}
    </span>
  );
}

interface JobTableProps {
  jobs: ScrapeJob[];
}

const JobTable: React.FC<JobTableProps> = ({ jobs }) => {
  if (jobs.length === 0) {
    return <p className="text-sm text-slate-500 py-8 text-center">No jobs found.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-slate-400 border-b border-slate-800">
            <th className="text-left py-3 px-3 font-medium">Job ID</th>
            <th className="text-left py-3 px-3 font-medium">Pincode Range</th>
            <th className="text-center py-3 px-3 font-medium">Round</th>
            <th className="text-left py-3 px-3 font-medium">Progress</th>
            <th className="text-center py-3 px-3 font-medium">Position</th>
            <th className="text-left py-3 px-3 font-medium">Status</th>
            <th className="text-right py-3 px-3 font-medium">Updated</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => {
            const pct = j.totalSearches > 0
              ? Math.round((j.completedSearches / j.totalSearches) * 100)
              : 0;
            const totalPincodes = Math.max(j.endPincode - j.startPincode + 1, 1);
            const searchesPerPincode = j.totalSearches > 0 ? j.totalSearches / totalPincodes : 1;
            const estPincodeOffset = Math.min(
              Math.floor(j.completedSearches / searchesPerPincode),
              totalPincodes - 1
            );
            const currentPincode = j.startPincode + estPincodeOffset;
            const searchesInCurrentPincode = Math.round(j.completedSearches % searchesPerPincode);
            const searchesPerPincodeRound = Math.round(searchesPerPincode);
            return (
              <tr key={j._id} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                <td className="py-2.5 px-3 text-slate-400 text-xs font-mono whitespace-nowrap">
                  {j.jobId.slice(0, 10)}…
                </td>
                <td className="py-2.5 px-3 text-slate-200 whitespace-nowrap">
                  {j.startPincode} – {j.endPincode}
                </td>
                <td className="py-2.5 px-3 text-center">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-900/40 text-purple-300">
                    R{j.round}
                  </span>
                </td>
                <td className="py-2.5 px-3 min-w-[160px]">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          j.status === 'completed' ? 'bg-emerald-500'
                          : (j.status === 'stopped' || j.status === 'stop') ? 'bg-red-500'
                          : 'bg-blue-500'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-400 w-20 text-right whitespace-nowrap">
                      {j.completedSearches}/{j.totalSearches} ({pct}%)
                    </span>
                  </div>
                </td>
                <td className="py-2.5 px-3 text-center whitespace-nowrap">
                  <div className="text-xs font-semibold text-slate-200">{currentPincode}</div>
                  <div className="text-[10px] text-slate-500">
                    {estPincodeOffset + 1}/{totalPincodes} · {searchesInCurrentPincode}/{searchesPerPincodeRound}
                  </div>
                </td>
                <td className="py-2.5 px-3 whitespace-nowrap">{statusBadge(j.status)}</td>
                <td className="py-2.5 px-3 text-right text-slate-500 text-xs whitespace-nowrap">
                  {new Date(j.updatedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default JobTable;
