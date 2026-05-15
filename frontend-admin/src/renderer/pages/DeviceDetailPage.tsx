import React, { useEffect, useState } from 'react';
import { useDeviceStore } from '../store/useDeviceStore';
import SessionTable from '../components/SessionTable';
import JobTable from '../components/JobTable';
import DeviceStatsChart from '../components/DeviceStatsChart';
import Pagination from '../components/Pagination';
import Spinner from '../components/Spinner';

interface DeviceDetailPageProps {
  deviceId: string;
  onBack: () => void;
}

type Tab = 'overview' | 'sessions' | 'jobs' | 'performance';

const DeviceDetailPage: React.FC<DeviceDetailPageProps> = ({ deviceId, onBack }) => {
  const {
    devices, selectedDevice, deviceSessions, deviceJobs, deviceHistory,
    totalSessions, totalJobs, sessionPage, sessionLimit, jobPage, jobLimit,
    loading, detailError,
    fetchDevices, fetchDeviceDetail, fetchDeviceSessions, fetchDeviceJobs, clearDeviceDetail,
  } = useDeviceStore();
  const [tab, setTab] = useState<Tab>('overview');
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number>(0);

  useEffect(() => {
    // If the devices list is empty (deep-link / refresh), prime it so the
    // store can hydrate the cached card before the detail request returns.
    if (devices.length === 0) fetchDevices(true);
  }, []);

  useEffect(() => {
    if (deviceId) {
      fetchDeviceDetail(deviceId);
      setLastRefreshedAt(Date.now());
    } else {
      clearDeviceDetail();
    }
    // Re-fetching is gated on deviceId — no stale data leaks across navigations.
  }, [deviceId]);

  // Auto-refresh every 30s while the page is open. Freshly-registered devices
  // arrive at this page with Live Stats already streaming over socket but the
  // initial /devices/:id snapshot still empty for sessions/jobs/history. Without
  // this poll the tabs would stay frozen on "No data" even as the DB fills up.
  useEffect(() => {
    if (!deviceId) return;
    const id = setInterval(() => {
      fetchDeviceDetail(deviceId, sessionPage, jobPage);
      setLastRefreshedAt(Date.now());
    }, 30_000);
    return () => clearInterval(id);
  }, [deviceId, sessionPage, jobPage]);

  const handleRefresh = () => {
    if (!deviceId) return;
    fetchDeviceDetail(deviceId, sessionPage, jobPage);
    setLastRefreshedAt(Date.now());
  };

  // ── Empty deviceId — operator landed here without selecting a device
  if (!deviceId || detailError?.kind === 'no-device-id') {
    return (
      <div className="text-center py-16">
        <svg className="w-12 h-12 text-slate-700 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2a4 4 0 014-4h4m4 4v6m0-6h-2m2 0a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2v10a2 2 0 002 2h6" />
        </svg>
        <p className="text-sm text-slate-400">No device selected.</p>
        <p className="text-xs text-slate-600 mt-1">Pick a device from the list to see its details.</p>
        <button onClick={onBack} className="text-sm text-blue-400 hover:text-blue-300 mt-3">
          Back to Devices
        </button>
      </div>
    );
  }

  // ── Loading and no cached card to show
  if (loading && !selectedDevice) {
    return <Spinner message="Loading device details..." />;
  }

  // ── 404 — device truly doesn't exist in DB
  if (detailError?.kind === 'not-found' && !selectedDevice) {
    return (
      <div className="text-center py-16">
        <svg className="w-12 h-12 text-slate-700 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm text-slate-400">Device not found in the database.</p>
        <p className="text-xs text-slate-600 mt-1 font-mono">{deviceId}</p>
        <button onClick={onBack} className="text-sm text-blue-400 hover:text-blue-300 mt-3">
          Back to Devices
        </button>
      </div>
    );
  }

  // ── Network / 5xx — operator should retry
  if (detailError?.kind === 'network' && !selectedDevice) {
    return (
      <div className="text-center py-16">
        <svg className="w-12 h-12 text-amber-500/70 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <p className="text-sm text-slate-300">Couldn&apos;t load device details.</p>
        <p className="text-xs text-amber-400/80 mt-1">{detailError.message}</p>
        <div className="flex items-center gap-3 justify-center mt-4">
          <button
            onClick={() => fetchDeviceDetail(deviceId)}
            className="text-sm bg-blue-600 hover:bg-blue-500 text-white font-medium px-4 py-1.5 rounded-lg transition-colors"
          >
            Retry
          </button>
          <button onClick={onBack} className="text-sm text-slate-400 hover:text-white transition-colors">
            Back to Devices
          </button>
        </div>
      </div>
    );
  }

  // ── No device data yet but no explicit error — empty state
  if (!selectedDevice) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-slate-500">No device data yet.</p>
        <button onClick={() => fetchDeviceDetail(deviceId)} className="text-sm text-blue-400 hover:text-blue-300 mt-2">
          Retry
        </button>
      </div>
    );
  }

  const d = selectedDevice;
  const stats = d.latestStats;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'sessions', label: `Sessions (${totalSessions})` },
    { key: 'jobs', label: `Jobs (${totalJobs})` },
    { key: 'performance', label: 'Performance' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-white">{d.nickname || d.ip || d.hostname}</h2>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              d.status === 'online' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
            }`}>
              {d.status === 'online' ? 'Online' : 'Offline'}
            </span>
          </div>
          <p className="text-sm text-slate-500">
            {d.ip ? `${d.ip} · ` : ''}{d.hostname} · {d.username} &middot; {d.platform} {d.osVersion}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 text-xs font-medium transition-colors"
          title={lastRefreshedAt ? `Last refreshed: ${new Date(lastRefreshedAt).toLocaleTimeString()} — auto every 30s` : 'Refresh now'}
        >
          <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-800 pb-px">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              tab === t.key
                ? 'bg-slate-900 text-white border border-slate-800 border-b-slate-900 -mb-px'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Device Specs */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-300 mb-4">Device Specs</h3>
            <div className="space-y-3 text-sm">
              {d.nickname && <Row label="Nickname" value={d.nickname} />}
              {d.ip && <Row label="IP Address" value={d.ip} mono />}
              <Row label="CPU" value={`${d.cpuModel} (${d.cpuCores} cores)`} />
              <Row label="Memory" value={`${d.totalMemoryGB} GB`} />
              <Row label="Architecture" value={d.arch} />
              <Row label="Platform" value={`${d.platform} ${d.osVersion}`} />
              <Row label="Device ID" value={d.deviceId} mono />
              <Row label="Registered" value={new Date(d.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })} />
              <Row label="Last Seen" value={new Date(d.lastSeenAt).toLocaleString()} />
            </div>
          </div>

          {/* Live Stats */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-300 mb-4">Live Stats</h3>
            {stats ? (
              <div className="space-y-4">
                <StatBarSimple label="CPU" percent={stats.cpuUsedPercent ?? 0} />
                <StatBar label="RAM" used={stats.ramUsedMB} total={stats.ramTotalMB} unit="MB" percent={stats.ramUsedPercent} />
                <StatBar label="Disk" used={stats.diskUsedGB} total={stats.diskTotalGB} unit="GB" percent={stats.diskUsedPercent} />
                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-800">
                  <div>
                    <p className="text-xs text-slate-400 mb-0.5">Network Sent</p>
                    <p className="text-lg font-bold text-blue-400">{stats.networkSentMB.toFixed(1)} MB</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-0.5">Network Recv</p>
                    <p className="text-lg font-bold text-cyan-400">{stats.networkRecvMB.toFixed(1)} MB</p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500 py-8 text-center">No live stats available.</p>
            )}
          </div>

          {/* Quick Summary */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 lg:col-span-2">
            <h3 className="text-sm font-semibold text-slate-300 mb-4">Activity Summary</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-slate-400">Total Sessions</p>
                <p className="text-2xl font-bold text-white">{totalSessions}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Active Jobs</p>
                <p className="text-2xl font-bold text-blue-400">
                  {d.activeJobs || 0}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Total Jobs</p>
                <p className="text-2xl font-bold text-slate-300">{totalJobs}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'sessions' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <SessionTable sessions={deviceSessions} showDevice={false} />
          {deviceSessions.length === 0 && d.status === 'online' && (
            <EmptyHint
              text="The device is online but hasn't completed a scraping session yet. A session is recorded when the scraper finishes a (pincode + niche + round) search."
              onRefresh={handleRefresh}
              busy={loading}
            />
          )}
          {totalSessions > sessionLimit && (
            <div className="border-t border-slate-800 mt-2 pt-2">
              <Pagination
                page={sessionPage}
                total={totalSessions}
                limit={sessionLimit}
                onPageChange={(p) => fetchDeviceSessions(deviceId, p)}
              />
            </div>
          )}
        </div>
      )}

      {tab === 'jobs' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <JobTable jobs={deviceJobs} />
          {deviceJobs.length === 0 && d.status === 'online' && (
            <EmptyHint
              text="No job (Scrape-Tracking) entries yet. The scraper creates a job at the start of a pincode-range run; this device may have just registered or be idle."
              onRefresh={handleRefresh}
              busy={loading}
            />
          )}
          {totalJobs > jobLimit && (
            <div className="border-t border-slate-800 mt-2 pt-2">
              <Pagination
                page={jobPage}
                total={totalJobs}
                limit={jobLimit}
                onPageChange={(p) => fetchDeviceJobs(deviceId, p)}
              />
            </div>
          )}
        </div>
      )}

      {tab === 'performance' && (
        <>
          <DeviceStatsChart history={deviceHistory} />
          {deviceHistory.length === 0 && d.status === 'online' && stats && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 mt-4">
              <EmptyHint
                text="Live stats are streaming, but no Device-History documents are visible yet. The first per-day document is upserted on the next stats flush (≈30 s)."
                onRefresh={handleRefresh}
                busy={loading}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};

/* Helper components */
function EmptyHint({ text, onRefresh, busy }: { text: string; onRefresh: () => void; busy: boolean }) {
  return (
    <div className="mt-4 -mx-1 px-4 py-3 bg-slate-950/60 border border-slate-800 rounded-lg flex items-start gap-3">
      <svg className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p className="text-xs text-slate-400 flex-1">
        {text} <span className="text-slate-600">Auto-refresh every 30 s.</span>
      </p>
      <button
        onClick={onRefresh}
        disabled={busy}
        className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50 font-medium transition-colors"
      >
        Refresh now
      </button>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-400">{label}</span>
      <span className={`text-slate-200 ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}

function StatBarSimple({ label, percent }: { label: string; percent: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-400">{label}</span>
        <span className="text-slate-300">{percent}%</span>
      </div>
      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${percent >= 85 ? 'bg-red-500' : percent >= 60 ? 'bg-yellow-500' : 'bg-green-500'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function StatBar({ label, used, total, unit, percent }: { label: string; used: number; total: number; unit: string; percent: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-400">{label}</span>
        <span className="text-slate-300">
          {used.toFixed(1)} / {total.toFixed(1)} {unit} ({percent}%)
        </span>
      </div>
      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${percent >= 85 ? 'bg-red-500' : percent >= 60 ? 'bg-yellow-500' : 'bg-green-500'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export default DeviceDetailPage;
