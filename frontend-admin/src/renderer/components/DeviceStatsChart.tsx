import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { DeviceHistoryDay } from '../../shared/types';

interface DeviceStatsChartProps {
  history: DeviceHistoryDay[];
}

const DeviceStatsChart: React.FC<DeviceStatsChartProps> = ({ history }) => {
  if (history.length === 0) {
    return <p className="text-sm text-slate-500 py-8 text-center">No performance data available.</p>;
  }

  // Flatten: take hourly samples (every 30th snapshot ~= 1 per hour at 2s intervals pushed every 5min)
  const data: Array<{ time: string; ram: number; disk: number }> = [];
  for (const day of [...history].reverse()) {
    const step = Math.max(1, Math.floor(day.stats.length / 24));
    for (let i = 0; i < day.stats.length; i += step) {
      const s = day.stats[i];
      data.push({
        time: new Date(s.timestamp).toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
        ram: s.ramUsedPercent,
        disk: s.diskUsedPercent,
      });
    }
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-slate-300 mb-4">Performance History (7 days)</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#64748b' }} interval="preserveStartEnd" />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#64748b' }} />
          <Tooltip
            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
            labelStyle={{ color: '#94a3b8' }}
          />
          <Legend wrapperStyle={{ fontSize: '12px' }} />
          <Line type="monotone" dataKey="ram" stroke="#3b82f6" name="RAM %" dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="disk" stroke="#f59e0b" name="Disk %" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default DeviceStatsChart;
