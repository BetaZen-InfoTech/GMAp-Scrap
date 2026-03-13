import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  color?: string;
  icon?: React.ReactNode;
  subtitle?: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, color = 'text-white', icon, subtitle }) => (
  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
    <div className="flex items-start justify-between">
      <div>
        <div className={`text-2xl font-bold ${color}`}>{value}</div>
        <div className="text-xs text-slate-400 mt-1">{label}</div>
        {subtitle && <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div>}
      </div>
      {icon && <div className="text-slate-600">{icon}</div>}
    </div>
  </div>
);

export default StatCard;
