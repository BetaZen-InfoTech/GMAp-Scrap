import React, { useEffect, useState, useCallback } from 'react';
import api from '../lib/api';
import Spinner from '../components/Spinner';

interface ServerInfo {
  app: { name: string; version: string; state: string | null; nodeEnv: string | null };
  runtime: { node: string; pid: number; startedAt: string; uptimeSeconds: number; uptime: string };
  os: { hostname: string; platform: string; arch: string; release: string; type: string; uptime: string };
  cpu: {
    model: string | null;
    cores: number;
    speedMHz: number | null;
    loadAverage: { '1m': number; '5m': number; '15m': number };
  };
  memory: {
    process: {
      rssFormatted: string;
      heapUsedFormatted: string;
      heapTotalFormatted: string;
      heapLimitFormatted: string;
      heapUsagePercent: number | null;
      externalFormatted: string;
      arrayBuffersFormatted: string;
    };
    system: {
      totalFormatted: string;
      freeFormatted: string;
      usedFormatted: string;
      usagePercent: number | null;
    };
  };
  mongo: { state: string; host: string | null; name: string | null };
  timestamp: string;
}

const barClass = (pct: number) => (pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-yellow-500' : 'bg-green-500');
const pillClass = (state: string) =>
  state === 'connected'
    ? 'bg-green-500/15 text-green-400 border-green-500/30'
    : state === 'connecting'
    ? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30'
    : 'bg-red-500/15 text-red-400 border-red-500/30';

const Bar: React.FC<{ pct: number }> = ({ pct }) => (
  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
    <div
      className={`h-full rounded-full transition-all duration-500 ${barClass(pct)}`}
      style={{ width: `${Math.min(pct, 100)}%` }}
    />
  </div>
);

const Card: React.FC<{ title: string; children: React.ReactNode; tone?: 'ok' | 'warn' | 'bad' | 'info' }> = ({
  title,
  children,
  tone = 'info',
}) => {
  const dotColor =
    tone === 'ok' ? 'bg-green-400' : tone === 'warn' ? 'bg-yellow-400' : tone === 'bad' ? 'bg-red-400' : 'bg-blue-400';
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
        {title}
      </h3>
      {children}
    </div>
  );
};

const KV: React.FC<{ k: string; v: string | number; mono?: boolean }> = ({ k, v, mono }) => (
  <div className="flex justify-between items-baseline gap-3 py-1">
    <span className="text-xs text-slate-400">{k}</span>
    <span
      className={`text-sm text-slate-200 font-medium text-right truncate ${
        mono ? 'font-mono text-xs' : ''
      }`}
      title={String(v)}
    >
      {v}
    </span>
  </div>
);

const ServerInfoPage: React.FC = () => {
  const [data, setData] = useState<ServerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInfo = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await api.get<ServerInfo>('/api/server-info', { timeout: 8000 });
      setData(res.data);
      setError(null);
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || 'Failed to fetch server info';
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchInfo();
    const t = setInterval(() => fetchInfo(true), 15000);
    return () => clearInterval(t);
  }, [fetchInfo]);

  if (loading && !data) {
    return <Spinner message="Loading server info..." />;
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <p className="text-sm text-slate-400">Failed to load server info.</p>
        {error && (
          <p className="text-xs text-red-300 bg-red-900/30 border border-red-800/60 rounded px-3 py-2 max-w-xl text-center">
            {error}
          </p>
        )}
        <button
          onClick={() => fetchInfo()}
          disabled={refreshing}
          className="text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg"
        >
          {refreshing ? 'Retrying…' : 'Retry'}
        </button>
      </div>
    );
  }

  const { app, runtime, os: sysOs, cpu, memory, mongo, timestamp } = data;
  const heapPct = memory.process.heapUsagePercent ?? 0;
  const sysPct = memory.system.usagePercent ?? 0;

  const heapTone = heapPct >= 90 ? 'bad' : heapPct >= 75 ? 'warn' : 'ok';
  const sysTone = sysPct >= 90 ? 'bad' : sysPct >= 75 ? 'warn' : 'ok';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Server Info</h2>
          <p className="text-sm text-slate-500 mt-0.5">Backend runtime, memory, CPU and MongoDB connection</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${pillClass(mongo.state)}`}>
            mongo: {mongo.state}
          </span>
          <span className="px-2.5 py-1 rounded-full text-[11px] font-medium border bg-blue-500/15 text-blue-300 border-blue-500/30">
            state: {app.state || '—'}
          </span>
          <span className="px-2.5 py-1 rounded-full text-[11px] font-medium border bg-slate-800 text-slate-300 border-slate-700">
            v{app.version}
          </span>
          <button
            onClick={() => fetchInfo()}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm text-slate-300 disabled:opacity-50 transition-colors"
          >
            <svg
              className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Top stats row */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card title="Uptime" tone="ok">
          <div className="text-2xl font-bold text-white leading-tight">{runtime.uptime}</div>
          <div className="text-xs text-slate-500 mt-1">process</div>
          <div className="mt-4 space-y-1">
            <KV k="system uptime" v={sysOs.uptime} />
            <KV k="started at" v={new Date(runtime.startedAt).toLocaleString()} mono />
          </div>
        </Card>

        <Card title="System Memory" tone={sysTone}>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-white">{sysPct.toFixed(2)}</span>
            <span className="text-base text-slate-500">%</span>
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {memory.system.usedFormatted} of {memory.system.totalFormatted} used
          </div>
          <div className="mt-4">
            <div className="flex justify-between text-[11px] text-slate-500 mb-1.5">
              <span>used</span>
              <span>free {memory.system.freeFormatted}</span>
            </div>
            <Bar pct={sysPct} />
          </div>
        </Card>

        <Card title="Process Memory (Heap)" tone={heapTone}>
          <div className="text-2xl font-bold text-white leading-tight">{memory.process.rssFormatted}</div>
          <div className="text-xs text-slate-500 mt-1">
            rss · heap {memory.process.heapUsedFormatted} / {memory.process.heapLimitFormatted} limit
          </div>
          <div className="mt-4">
            <div className="flex justify-between text-[11px] text-slate-500 mb-1.5">
              <span>heap used vs limit</span>
              <span>{heapPct.toFixed(2)}%</span>
            </div>
            <Bar pct={heapPct} />
          </div>
        </Card>

        <Card title="CPU">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">{cpu.cores}</span>
            <span className="text-sm text-slate-500">cores</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1 truncate" title={cpu.model || ''}>
            {cpu.model || '—'}
          </div>
          <div className="mt-4 space-y-1">
            <KV k="base speed" v={`${cpu.speedMHz || 0} MHz`} />
            <KV
              k="load avg"
              v={`${cpu.loadAverage['1m'].toFixed(2)} · ${cpu.loadAverage['5m'].toFixed(2)} · ${cpu.loadAverage['15m'].toFixed(2)}`}
              mono
            />
          </div>
        </Card>
      </div>

      {/* Detail row */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <Card title="Runtime">
          <div className="space-y-1">
            <KV k="Node.js" v={runtime.node} mono />
            <KV k="process id" v={runtime.pid} mono />
            <KV k="app version" v={app.version} mono />
            <KV k="app state" v={app.state || '—'} />
            <KV k="node env" v={app.nodeEnv || '—'} />
          </div>
        </Card>

        <Card title="Host">
          <div className="space-y-1">
            <KV k="hostname" v={sysOs.hostname} mono />
            <KV k="platform" v={`${sysOs.platform} (${sysOs.arch})`} />
            <KV k="os type" v={sysOs.type} />
            <KV k="kernel" v={sysOs.release} mono />
          </div>
        </Card>

        <Card title="MongoDB" tone={mongo.state === 'connected' ? 'ok' : 'bad'}>
          <div className="space-y-1">
            <KV k="state" v={mongo.state} />
            <KV k="host" v={mongo.host || '—'} mono />
            <KV k="database" v={mongo.name || '—'} mono />
          </div>
        </Card>

        <Card title="Process Memory Breakdown">
          <div className="space-y-1">
            <KV k="rss" v={memory.process.rssFormatted} mono />
            <KV k="heap used" v={memory.process.heapUsedFormatted} mono />
            <KV k="heap allocated" v={memory.process.heapTotalFormatted} mono />
            <KV k="heap limit" v={memory.process.heapLimitFormatted} mono />
            <KV k="external" v={memory.process.externalFormatted} mono />
            <KV k="array buffers" v={memory.process.arrayBuffersFormatted} mono />
          </div>
        </Card>
      </div>

      <div className="text-[11px] text-slate-600 text-right">
        Last refreshed: {new Date(timestamp).toLocaleString()} · auto-refresh every 15s
      </div>
    </div>
  );
};

export default ServerInfoPage;
