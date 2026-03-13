import React, { useEffect, useState } from 'react';
import type { DeviceStats } from '../../shared/types';

function barColor(percent: number): string {
  if (percent >= 85) return 'bg-red-500';
  if (percent >= 60) return 'bg-yellow-500';
  return 'bg-green-500';
}

function textColor(percent: number): string {
  if (percent >= 85) return 'text-red-400';
  if (percent >= 60) return 'text-yellow-400';
  return 'text-green-400';
}

function formatMB(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

function formatGB(gb: number): string {
  return `${gb.toFixed(1)} GB`;
}

const DeviceStatsBar: React.FC = () => {
  const [stats, setStats] = useState<DeviceStats | null>(null);

  useEffect(() => {
    // Initial fetch
    window.electronAPI.getDeviceStats().then(setStats).catch(() => {});

    // Live updates every 2s from main process
    const off = window.electronAPI.onDeviceStats((s) => setStats(s));
    return () => off();
  }, []);

  if (!stats) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl px-5 py-3 mb-6 animate-pulse">
        <div className="h-4 bg-slate-800 rounded w-48" />
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl px-5 py-4 mb-6">
      <div className="grid grid-cols-4 gap-6">
        {/* CPU */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span className="text-xs font-medium text-slate-300">CPU</span>
            </div>
            <span className={`text-xs font-semibold ${textColor(stats.cpuUsedPercent)}`}>
              {stats.cpuUsedPercent}%
            </span>
          </div>
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden mb-1">
            <div
              className={`h-full rounded-full transition-all duration-500 ${barColor(stats.cpuUsedPercent)}`}
              style={{ width: `${stats.cpuUsedPercent}%` }}
            />
          </div>
          <p className="text-xs text-slate-500">
            {stats.cpuUsedPercent}% utilization
          </p>
        </div>

        {/* RAM */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
              <span className="text-xs font-medium text-slate-300">RAM</span>
            </div>
            <span className={`text-xs font-semibold ${textColor(stats.ramUsedPercent)}`}>
              {stats.ramUsedPercent}%
            </span>
          </div>
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden mb-1">
            <div
              className={`h-full rounded-full transition-all duration-500 ${barColor(stats.ramUsedPercent)}`}
              style={{ width: `${stats.ramUsedPercent}%` }}
            />
          </div>
          <p className="text-xs text-slate-500">
            {formatMB(stats.ramUsedMB)} / {formatMB(stats.ramTotalMB)}
          </p>
        </div>

        {/* Disk */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
              </svg>
              <span className="text-xs font-medium text-slate-300">Disk (C:)</span>
            </div>
            <span className={`text-xs font-semibold ${textColor(stats.diskUsedPercent)}`}>
              {stats.diskUsedPercent}%
            </span>
          </div>
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden mb-1">
            <div
              className={`h-full rounded-full transition-all duration-500 ${barColor(stats.diskUsedPercent)}`}
              style={{ width: `${stats.diskUsedPercent}%` }}
            />
          </div>
          <p className="text-xs text-slate-500">
            {formatGB(stats.diskUsedGB)} / {formatGB(stats.diskTotalGB)}
          </p>
        </div>

        {/* Network Bandwidth */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="text-xs font-medium text-slate-300">Network</span>
            </div>
            <span className="text-xs text-slate-500">live</span>
          </div>
          <div className="flex items-center gap-4 mt-1">
            <div className="flex items-center gap-1.5">
              <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
              <span className="text-sm font-medium text-green-400">
                {stats.networkRecvMB.toFixed(1)}
              </span>
              <span className="text-xs text-slate-500">MB</span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg className="w-3 h-3 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
              <span className="text-sm font-medium text-blue-400">
                {stats.networkSentMB.toFixed(1)}
              </span>
              <span className="text-xs text-slate-500">MB</span>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            per 2s interval
          </p>
        </div>
      </div>
    </div>
  );
};

export default DeviceStatsBar;
