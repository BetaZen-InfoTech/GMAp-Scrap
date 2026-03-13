import React from 'react';
import type { ScrapeJob } from '../../shared/types';

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    running: 'bg-blue-500/20 text-blue-400',
    paused: 'bg-yellow-500/20 text-yellow-400',
    completed: 'bg-green-500/20 text-green-400',
    stopped: 'bg-red-500/20 text-red-400',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[status] || 'bg-slate-700 text-slate-300'}`}>
      {status}
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
            <th className="text-left py-3 px-3 font-medium">Progress</th>
            <th className="text-center py-3 px-3 font-medium">Status</th>
            <th className="text-right py-3 px-3 font-medium">Updated</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => {
            const pct = j.totalSearches > 0 ? ((j.completedSearches / j.totalSearches) * 100).toFixed(1) : '0';
            return (
              <tr key={j._id} className="border-b border-slate-800/50 hover:bg-slate-900/50">
                <td className="py-2.5 px-3 text-slate-300 text-xs font-mono">
                  {j.jobId.slice(0, 8)}…
                </td>
                <td className="py-2.5 px-3 text-slate-200">
                  {j.startPincode} – {j.endPincode}
                </td>
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-slate-400 w-16 text-right">
                      {j.completedSearches}/{j.totalSearches}
                    </span>
                  </div>
                </td>
                <td className="py-2.5 px-3 text-center">{statusBadge(j.status)}</td>
                <td className="py-2.5 px-3 text-right text-slate-500 text-xs">
                  {new Date(j.updatedAt).toLocaleDateString()}
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
