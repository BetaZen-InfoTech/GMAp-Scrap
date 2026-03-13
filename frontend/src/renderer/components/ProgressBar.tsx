import React from 'react';

interface ProgressBarProps {
  value: number;   // 0–100
  label?: string;
  color?: 'blue' | 'green' | 'yellow' | 'red';
}

const colorMap = {
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  yellow: 'bg-yellow-400',
  red: 'bg-red-500',
};

const ProgressBar: React.FC<ProgressBarProps> = ({ value, label, color = 'blue' }) => {
  const clamped = Math.min(100, Math.max(0, value));
  const bar = colorMap[color];

  return (
    <div className="w-full">
      {label && (
        <div className="flex justify-between mb-1">
          <span className="text-xs text-slate-400">{label}</span>
          <span className="text-xs text-slate-300 font-mono">{clamped.toFixed(0)}%</span>
        </div>
      )}
      <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
        <div
          className={`h-2 rounded-full transition-all duration-300 ${bar}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
};

export default ProgressBar;
