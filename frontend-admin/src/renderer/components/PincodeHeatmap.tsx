import React from 'react';

interface PincodeHeatmapProps {
  data: Array<{ pincode: string; count: number }>;
}

const PincodeHeatmap: React.FC<PincodeHeatmapProps> = ({ data }) => {
  if (data.length === 0) {
    return <p className="text-sm text-slate-500 py-8 text-center">No pincode data available.</p>;
  }

  const maxCount = data[0]?.count || 1;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-slate-300 mb-4">Top Pincodes</h3>
      <div className="max-h-[300px] overflow-y-auto space-y-1.5">
        {data.slice(0, 30).map((item) => {
          const pct = (item.count / maxCount) * 100;
          return (
            <div key={item.pincode} className="flex items-center gap-3">
              <span className="text-xs text-slate-300 font-mono w-16">{item.pincode}</span>
              <div className="flex-1 h-4 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500/60 rounded-full"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs text-slate-400 w-16 text-right">{item.count.toLocaleString()}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PincodeHeatmap;
