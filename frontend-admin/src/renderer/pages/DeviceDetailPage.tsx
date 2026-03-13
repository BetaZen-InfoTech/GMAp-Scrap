import React, { useEffect, useState } from 'react';
import { useDeviceStore } from '../store/useDeviceStore';
import SessionTable from '../components/SessionTable';
import JobTable from '../components/JobTable';
import DeviceStatsChart from '../components/DeviceStatsChart';
import Spinner from '../components/Spinner';

interface DeviceDetailPageProps {
  deviceId: string;
  onBack: () => void;
}

type Tab = 'overview' | 'sessions' | 'jobs' | 'performance';

function barColor(percent: number): string {
  if (percent >= 85) return 'bg-red-500';
  if (percent >= 60) return 'bg-yellow-500';
  return 'bg-green-500';
}

const DeviceDetailPage: React.FC<DeviceDetailPageProps> = ({ deviceId, onBack }) => {
  const { selectedDevice, deviceSessions, deviceJobs, deviceHistory, loading, fetchDeviceDetail } = useDeviceStore();
  const [tab, setTab] = useState<Tab>('overview');

  useEffect(() => {
    if (deviceId) fetchDeviceDetail(deviceId);
  }, [deviceId]);

  if (loading && !selectedDevice) {
    return <Spinner message="Loading device details..." />;
  }

  if (!selectedDevice) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-slate-500">Device not found.</p>
        <button onClick={onBack} className="text-sm text-blue-400 hover:text-blue-300 mt-2">
          Back to Devices
        </button>
      </div>
    );
  }

  const d = selectedDevice;
  const stats = d.latestStats;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'sessions', label: `Sessions (${deviceSessions.length})` },
    { key: 'jobs', label: `Jobs (${deviceJobs.length})` },
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
            <h2 className="text-lg font-bold text-white">{d.nickname || d.hostname}</h2>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              d.isActive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
            }`}>
              {d.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
          <p className="text-sm text-slate-500">
            {d.nickname ? `${d.hostname} · ` : ''}{d.username} &middot; {d.platform} {d.osVersion}
          </p>
        </div>
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
              <Row label="CPU" value={`${d.cpuModel} (${d.cpuCores} cores)`} />
              <Row label="Memory" value={`${d.totalMemoryGB} GB`} />
              <Row label="Architecture" value={d.arch} />
              <Row label="Platform" value={`${d.platform} ${d.osVersion}`} />
              <Row label="Device ID" value={d.deviceId} mono />
              <Row label="Registered" value={new Date(d.createdAt).toLocaleDateString()} />
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
                <p className="text-2xl font-bold text-white">{deviceSessions.length}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Active Jobs</p>
                <p className="text-2xl font-bold text-blue-400">
                  {deviceJobs.filter((j) => j.status === 'running' || j.status === 'paused').length}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Total Jobs</p>
                <p className="text-2xl font-bold text-slate-300">{deviceJobs.length}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'sessions' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <SessionTable sessions={deviceSessions} showDevice={false} />
        </div>
      )}

      {tab === 'jobs' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <JobTable jobs={deviceJobs} />
        </div>
      )}

      {tab === 'performance' && (
        <DeviceStatsChart history={deviceHistory} />
      )}
    </div>
  );
};

/* Helper components */
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
