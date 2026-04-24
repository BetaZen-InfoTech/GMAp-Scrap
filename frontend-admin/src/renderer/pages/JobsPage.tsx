import React, { useEffect, useState } from 'react';
import { useJobsStore } from '../store/useJobsStore';
import { useDeviceStore } from '../store/useDeviceStore';
import Pagination from '../components/Pagination';
import Spinner from '../components/Spinner';
import api from '../lib/api';

const STATUS_OPTIONS = [
  { value: '',          label: 'All Statuses' },
  { value: 'running',   label: 'Running'      },
  { value: 'paused',    label: 'Paused'       },
  { value: 'completed', label: 'Completed'    },
  { value: 'stop',      label: 'Stop'         },
  { value: 'stopped',   label: 'Stopped'      },
] as const;

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
  const label: Record<string, string> = {
    stop:    'Stop',
    stopped: 'Stop',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full ${map[status] || 'bg-slate-700 text-slate-300'}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot[status] || 'bg-slate-400'}`} />
      {label[status] ?? (status.charAt(0).toUpperCase() + status.slice(1))}
    </span>
  );
}

function formatDate(str: string) {
  const d = new Date(str);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ─── Cron Job Card ───────────────────────────────────────────────
interface CronCardProps {
  name: string;
  label: string;
  description: string;
  interval: string;
}

const CronCard: React.FC<CronCardProps> = ({ name, label, description, interval }) => {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError]   = useState<string | null>(null);

  const trigger = async () => {
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const res = await api.post(`/api/admin/cron/run/${name}`);
      const r = res.data.result || {};
      const parts: string[] = [];
      if (r.updated   != null) parts.push(`${r.updated} updated`);
      if (r.completed != null) parts.push(`${r.completed} completed`);
      if (r.running   != null) parts.push(`${r.running} running`);
      if (r.stopped   != null) parts.push(`${r.stopped} stopped`);
      if (r.resumed   != null) parts.push(`${r.resumed} resumed`);
      if (r.modifiedCount != null) parts.push(`${r.modifiedCount} devices offline`);
      setResult(parts.length ? parts.join(' · ') : 'Done');
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold text-white">{label}</span>
          <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">{interval}</span>
        </div>
        <p className="text-xs text-slate-500">{description}</p>
        {result && (
          <p className="text-xs text-emerald-400 mt-1.5 font-medium">{result}</p>
        )}
        {error && (
          <p className="text-xs text-red-400 mt-1.5">{error}</p>
        )}
      </div>
      <button
        onClick={trigger}
        disabled={running}
        className="shrink-0 flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
      >
        {running ? (
          <>
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            Running…
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Run Now
          </>
        )}
      </button>
    </div>
  );
};

// ─── Admin Action Card ──────────────────────────────────────────
interface ActionCardProps {
  label: string;
  description: string;
  buttonLabel?: string;
  buttonColor?: string;
  onRun: () => Promise<string>;
}

const ActionCard: React.FC<ActionCardProps> = ({ label, description, buttonLabel = 'Run', buttonColor = 'bg-red-600 hover:bg-red-500', onRun }) => {
  const [running, setRunning] = useState(false);
  const [result, setResult]   = useState<string | null>(null);
  const [error, setError]     = useState<string | null>(null);

  const trigger = async () => {
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const msg = await onRun();
      setResult(msg);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <span className="text-sm font-semibold text-white">{label}</span>
        <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        {result && <p className="text-xs text-emerald-400 mt-1.5 font-medium">{result}</p>}
        {error && <p className="text-xs text-red-400 mt-1.5">{error}</p>}
      </div>
      <button
        onClick={trigger}
        disabled={running}
        className={`shrink-0 flex items-center gap-1.5 ${buttonColor} disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors`}
      >
        {running ? (
          <>
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            Running…
          </>
        ) : (
          buttonLabel
        )}
      </button>
    </div>
  );
};

// ─── Main Page ───────────────────────────────────────────────────
const JobsPage: React.FC = () => {
  const { jobs, total, page, limit, loading, filters, statusCounts, fetchJobs, setLimit, setFilters, clearFilters } = useJobsStore();
  const { devices, fetchDevices } = useDeviceStore();

  useEffect(() => {
    fetchDevices();
    fetchJobs(1);
  }, []);

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Jobs</h2>
          <p className="text-sm text-slate-500 mt-0.5">{total.toLocaleString()} total jobs</p>
        </div>
        <button
          onClick={() => fetchJobs(page)}
          className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium px-3 py-2 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Stat chips — from backend statusCounts (all pages) */}
      <div className="flex flex-wrap gap-3">
        {[
          { key: 'running',   label: 'Running',   dot: 'bg-blue-400 animate-pulse',  chip: 'border-blue-800/50'    },
          { key: 'paused',    label: 'Paused',    dot: 'bg-yellow-400',               chip: 'border-yellow-800/50'  },
          { key: 'completed', label: 'Completed', dot: 'bg-emerald-400',              chip: 'border-emerald-800/50' },
          { key: 'stop',      label: 'Stop',      dot: 'bg-red-400',                  chip: 'border-red-800/50'     },
        ].map(({ key, label, dot, chip }) => (
          <div key={key} className={`flex items-center gap-2 bg-slate-900 border ${chip} rounded-lg px-3 py-2`}>
            <span className={`w-2 h-2 rounded-full ${dot}`} />
            <span className="text-xs text-slate-300 font-medium">
              {statusCounts[key] ?? 0} {label}
            </span>
          </div>
        ))}
      </div>

      {/* Cron Jobs Panel */}
      <div>
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Cron Jobs</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <CronCard
            name="device-offline"
            label="Device Offline Check"
            description="Marks devices offline if no activity for 2.55 min."
            interval="Every 3 min"
          />
          <CronCard
            name="pincode-completion"
            label="Pincode Completion Check"
            description="Marks pincodes as completed when all niches/rounds are done."
            interval="Every 5 min"
          />
          <CronCard
            name="pincode-stop"
            label="Pincode Stop Check"
            description="Marks pincodes as stopped if no new data submitted in 3 min."
            interval="Every 3 min"
          />
          <CronCard
            name="scrape-job-status"
            label="Job Status Check"
            description="Marks jobs as Stop (no activity 3 min) or Completed (all sessions done). Resumes Stop jobs if new data arrives."
            interval="Every 3 min"
          />
        </div>
      </div>

      {/* Admin Actions */}
      <div>
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Admin Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <ActionCard
            label="Search-Status Dedup"
            description="Delete duplicate Search-Status entries matching same category, subCategory & pincode. Merges rounds, keeps oldest."
            buttonLabel="Delete Duplicates"
            buttonColor="bg-red-600 hover:bg-red-500"
            onRun={async () => {
              const res = await api.delete('/api/admin/search-status/dedup', { timeout: 300000 });
              const d = res.data;
              if (d.deletedCount === 0) return 'No duplicates found';
              return `Deleted ${d.deletedCount} duplicates across ${d.groupsAffected} groups`;
            }}
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filters.deviceId || ''}
          onChange={(e) => { setFilters({ deviceId: e.target.value || undefined }); fetchJobs(1); }}
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
        >
          <option value="">All Devices</option>
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>{d.nickname || d.ip || d.hostname}</option>
          ))}
        </select>

        <select
          value={filters.status || ''}
          onChange={(e) => { setFilters({ status: e.target.value || undefined }); fetchJobs(1); }}
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {(filters.deviceId || filters.status) && (
          <button
            onClick={() => { clearFilters(); setTimeout(() => fetchJobs(1), 0); }}
            className="text-slate-400 hover:text-white text-sm transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
        {loading && jobs.length === 0 ? (
          <div className="p-8 flex justify-center"><Spinner message="Loading jobs..." /></div>
        ) : jobs.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">No jobs found</div>
        ) : (
          <>
            <div className="overflow-auto flex-1">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-900 z-10">
                  <tr className="border-b border-slate-800">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Job ID</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Device</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Pincode Range</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Round</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Progress</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Position</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Last Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {jobs.map((j) => {
                    const pct = j.totalSearches > 0
                      ? Math.round((j.completedSearches / j.totalSearches) * 100)
                      : 0;
                    const totalPincodes = Math.max(j.endPincode - j.startPincode + 1, 1);
                    const currentPincode = j.startPincode + j.pincodeIndex;
                    const nichesPerRound = j.totalSearches > 0 ? Math.round(j.totalSearches / totalPincodes / 3) : 0;
                    return (
                      <tr key={j._id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs text-slate-400">{j.jobId.slice(0, 12)}…</span>
                        </td>
                        <td className="px-4 py-3 text-white whitespace-nowrap">
                          {j.deviceName || j.deviceId.slice(0, 8)}
                        </td>
                        <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                          {j.startPincode} – {j.endPincode}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-900/40 text-purple-300">
                            R{j.round}
                          </span>
                        </td>
                        <td className="px-4 py-3 min-w-[160px]">
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
                            <span className="text-xs text-slate-400 w-24 text-right whitespace-nowrap">
                              {j.completedSearches}/{j.totalSearches} ({pct}%)
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <div className="text-xs font-semibold text-slate-200">{currentPincode}</div>
                          <div className="text-[10px] text-slate-500">
                            Pin {j.pincodeIndex + 1}/{totalPincodes} · Niche {j.nicheIndex + 1}/{nichesPerRound}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {statusBadge(j.status)}
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-slate-500 whitespace-nowrap">
                          {formatDate(j.updatedAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t border-slate-800 px-4 py-2">
              <Pagination page={page} total={total} limit={limit} onPageChange={(p) => fetchJobs(p)} onLimitChange={(l) => { setLimit(l); setTimeout(() => fetchJobs(1), 0); }} />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default JobsPage;
