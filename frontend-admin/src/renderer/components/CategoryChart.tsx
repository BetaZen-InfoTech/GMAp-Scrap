import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface CategoryChartProps {
  data: Array<{ category: string; count: number }>;
  title: string;
}

const CategoryChart: React.FC<CategoryChartProps> = ({ data, title }) => {
  if (data.length === 0) {
    return <p className="text-sm text-slate-500 py-8 text-center">No data available.</p>;
  }

  const chartData = data.slice(0, 15).map((d) => ({
    name: d.category.length > 20 ? d.category.slice(0, 20) + '…' : d.category,
    count: d.count,
  }));

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-slate-300 mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} />
          <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 10, fill: '#94a3b8' }} />
          <Tooltip
            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
          />
          <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default CategoryChart;
