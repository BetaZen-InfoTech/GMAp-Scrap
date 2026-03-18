import React from 'react';
import type { DeviceInfo } from '../../shared/types';

function barColor(percent: number): string {
  if (percent >= 85) return 'bg-red-500';
  if (percent >= 60) return 'bg-yellow-500';
  return 'bg-green-500';
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface DeviceCardProps {
  device: DeviceInfo;
  onClick: (deviceId: string) => void;
}

const DeviceCard: React.FC<DeviceCardProps> = ({ device, onClick }) => {
  const stats = device.latestStats;

  return (
    <button
      onClick={() => onClick(device.deviceId)}
      className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-left hover:border-slate-600 transition-colors w-full"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-white">
            {device.nickname || device.ip || device.hostname}
          </h3>
          <p className="text-xs text-slate-500">
            {device.ip ? device.ip + ' · ' : ''}{device.hostname} · {device.username}
          </p>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          device.status === 'online'
            ? 'bg-green-500/20 text-green-400'
            : 'bg-red-500/20 text-red-400'
        }`}>
          {device.status === 'online' ? 'Online' : 'Offline'}
        </span>
      </div>

      {/* Specs */}
      <div className="text-xs text-slate-400 mb-3 space-y-0.5">
        <p>{device.cpuModel} ({device.cpuCores} cores)</p>
        <p>{device.totalMemoryGB} GB RAM · {device.arch}</p>
      </div>

      {/* Live Stats */}
      {stats ? (
        <div className="space-y-2 mb-3">
          <div>
            <div className="flex justify-between text-xs mb-0.5">
              <span className="text-slate-400">CPU</span>
              <span className="text-slate-300">{stats.cpuUsedPercent ?? 0}%</span>
            </div>
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${barColor(stats.cpuUsedPercent ?? 0)}`}
                style={{ width: `${stats.cpuUsedPercent ?? 0}%` }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs mb-0.5">
              <span className="text-slate-400">RAM</span>
              <span className="text-slate-300">{stats.ramUsedPercent}%</span>
            </div>
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${barColor(stats.ramUsedPercent)}`}
                style={{ width: `${stats.ramUsedPercent}%` }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs mb-0.5">
              <span className="text-slate-400">Disk</span>
              <span className="text-slate-300">{stats.diskUsedPercent}%</span>
            </div>
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${barColor(stats.diskUsedPercent)}`}
                style={{ width: `${stats.diskUsedPercent}%` }} />
            </div>
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-600 mb-3">No live stats</p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{device.activeJobs ?? 0} jobs · {device.totalSessions ?? 0} sessions</span>
        <span>{timeAgo(device.lastSeenAt)}</span>
      </div>
    </button>
  );
};

export default DeviceCard;
