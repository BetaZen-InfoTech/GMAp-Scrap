import React from 'react';
import type { ScrapedDataRecord } from '../../shared/types';

interface ScrapExcelViewProps {
  records: ScrapedDataRecord[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
}

const columns: { key: keyof ScrapedDataRecord; label: string; width?: string }[] = [
  { key: 'name', label: 'Name', width: '160px' },
  { key: 'phone', label: 'Phone', width: '110px' },
  { key: 'email', label: 'Email', width: '150px' },
  { key: 'address', label: 'Address', width: '200px' },
  { key: 'website', label: 'Website', width: '150px' },
  { key: 'rating', label: 'Rating', width: '50px' },
  { key: 'reviews', label: 'Reviews', width: '60px' },
  { key: 'category', label: 'Category', width: '120px' },
  { key: 'pincode', label: 'Pincode', width: '70px' },
  { key: 'plusCode', label: 'PlusCode', width: '100px' },
  { key: 'latitude', label: 'Lat', width: '80px' },
  { key: 'longitude', label: 'Lng', width: '80px' },
  { key: 'scrapKeyword', label: 'Keyword', width: '140px' },
  { key: 'scrapCategory', label: 'ScrapCat', width: '100px' },
  { key: 'scrapSubCategory', label: 'ScrapSub', width: '100px' },
  { key: 'scrapRound', label: 'Round', width: '50px' },
  { key: 'scrapedAt', label: 'Scraped At', width: '100px' },
];

const ScrapExcelView: React.FC<ScrapExcelViewProps> = ({ records, selectedIds, onToggleSelect }) => {
  return (
    <div className="overflow-auto flex-1 border border-slate-700 rounded-lg">
      <table className="text-xs font-mono border-collapse w-max min-w-full">
        <thead className="sticky top-0 z-10">
          <tr className="bg-slate-800">
            <th className="px-1.5 py-1.5 border-r border-b border-slate-700 text-center w-8">
              <span className="sr-only">Select</span>
            </th>
            <th className="px-1.5 py-1.5 border-r border-b border-slate-700 text-center text-slate-500 w-8">#</th>
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-2 py-1.5 border-r border-b border-slate-700 text-left text-slate-400 font-semibold whitespace-nowrap"
                style={{ minWidth: col.width }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((rec, idx) => (
            <tr
              key={rec._id}
              className={`transition-colors ${
                selectedIds.has(rec._id) ? 'bg-blue-900/20' : idx % 2 === 0 ? 'bg-slate-900' : 'bg-slate-900/50'
              } hover:bg-slate-800/60`}
            >
              <td className="px-1.5 py-1 border-r border-slate-800 text-center">
                <input
                  type="checkbox"
                  checked={selectedIds.has(rec._id)}
                  onChange={() => onToggleSelect(rec._id)}
                  className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-0 cursor-pointer"
                />
              </td>
              <td className="px-1.5 py-1 border-r border-slate-800 text-center text-slate-600">{idx + 1}</td>
              {columns.map((col) => {
                const val = rec[col.key];
                let display: string;
                if (val == null || val === '') {
                  display = '';
                } else if (col.key === 'scrapedAt' && typeof val === 'string') {
                  display = new Date(val).toLocaleDateString();
                } else {
                  display = String(val);
                }
                return (
                  <td
                    key={col.key}
                    className={`px-2 py-1 border-r border-slate-800 whitespace-nowrap truncate ${
                      display ? 'text-slate-300' : 'text-slate-700'
                    }`}
                    style={{ maxWidth: col.width }}
                    title={display}
                  >
                    {display || '—'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ScrapExcelView;
