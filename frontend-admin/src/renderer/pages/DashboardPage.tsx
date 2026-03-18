import React, { useEffect } from 'react';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import StatCard from '../components/StatCard';
import CategoryChart from '../components/CategoryChart';
import PincodeHeatmap from '../components/PincodeHeatmap';
import Spinner from '../components/Spinner';

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return '0s';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

// Safe helper: coerce any value to a float and call toFixed
function toFixed(val: unknown, decimals = 1): string {
  const n = Number(val);
  return isNaN(n) ? '0.0' : n.toFixed(decimals);
}

// Safe helper: coerce any value to a number and call toLocaleString
function toLocale(val: unknown): string {
  const n = Number(val);
  return isNaN(n) ? '0' : n.toLocaleString();
}

const DashboardPage: React.FC = () => {
  const { data, loading, fetchAnalytics } = useAnalyticsStore();
  const [refreshing, setRefreshing] = React.useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAnalytics();
    setRefreshing(false);
  };

  useEffect(() => {
    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !data) {
    return <Spinner message="Loading analytics..." />;
  }

  if (!data) {
    return <p className="text-sm text-slate-500 py-16 text-center">Failed to load analytics.</p>;
  }

  const completionRate = Number(data.sessionCompletionRate) || 0;
  const duplicateRate = Number(data.duplicateRate) || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Dashboard</h2>
          <p className="text-sm text-slate-500 mt-0.5">Overview of all scraping activity</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing || loading}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm text-slate-300 disabled:opacity-50 transition-colors"
        >
          <svg
            className={`w-4 h-4 ${refreshing || loading ? 'animate-spin' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          label="Total Records"
          value={toLocale(data.totalRecords)}
          color="text-blue-400"
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7c0-2-1-3-3-3H7c-2 0-3 1-3 3z" />
            </svg>
          }
        />
        <StatCard
          label="Duplicate Rate"
          value={`${toFixed(duplicateRate)}%`}
          color="text-yellow-400"
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          }
        />
        <StatCard
          label="Active Devices"
          value={Number(data.activeDevices) || 0}
          color="text-green-400"
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
            </svg>
          }
        />
        <StatCard
          label="Inactive Devices"
          value={Number(data.inactiveDevices) || 0}
          color="text-red-400"
        />
        <StatCard
          label="Jobs Running"
          value={Number(data.jobsInProgress) || 0}
          color="text-purple-400"
        />
        <StatCard
          label="Pincodes Covered"
          value={toLocale(data.pincodesCovered)}
          color="text-cyan-400"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CategoryChart data={data.topCategories ?? []} title="Top Categories" />
        <PincodeHeatmap data={data.topPincodes ?? []} />
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Records per Device */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Records per Device</h3>
          {(data.recordsPerDevice ?? []).length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">No device data.</p>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {(data.recordsPerDevice ?? []).map((d) => {
                const maxCount = data.recordsPerDevice[0]?.count || 1;
                const pct = (d.count / maxCount) * 100;
                return (
                  <div key={d.deviceId} className="flex items-center gap-3">
                    <span className="text-xs text-slate-300 w-32 truncate" title={d.hostname}>
                      {d.hostname}
                    </span>
                    <div className="flex-1 h-4 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-purple-500/60 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-400 w-20 text-right">
                      {toLocale(d.count)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Session Stats */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Session Performance</h3>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-slate-400 mb-1">Completion Rate</p>
              <div className="flex items-end gap-2">
                <span className="text-2xl font-bold text-green-400">
                  {toFixed(completionRate)}%
                </span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden mt-2">
                <div
                  className="h-full bg-green-500 rounded-full"
                  style={{ width: `${Math.min(completionRate, 100)}%` }}
                />
              </div>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Avg Duration</p>
              <span className="text-2xl font-bold text-blue-400">
                {formatDuration(Number(data.avgSessionDurationMs) || 0)}
              </span>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Jobs Completed</p>
              <span className="text-2xl font-bold text-emerald-400">
                {Number(data.jobsCompleted) || 0}
              </span>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Duplicate Records</p>
              <span className="text-2xl font-bold text-yellow-400">
                {toLocale(data.duplicateRecords)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
