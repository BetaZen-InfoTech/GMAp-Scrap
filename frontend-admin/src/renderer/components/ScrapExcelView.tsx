import React, { useState, useMemo } from 'react';
import type { ScrapedDataRecord } from '../../shared/types';

interface ScrapExcelViewProps {
  records: ScrapedDataRecord[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
}

type SortDir = 'asc' | 'desc';

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
  const [sortKey, setSortKey] = useState<keyof ScrapedDataRecord | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [filterCol, setFilterCol] = useState<keyof ScrapedDataRecord | null>(null);
  const [colSearch, setColSearch] = useState('');

  const handleSort = (key: keyof ScrapedDataRecord) => {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc');
      else { setSortKey(null); setSortDir('asc'); }
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const toggleFilter = (key: keyof ScrapedDataRecord) => {
    if (filterCol === key) {
      setFilterCol(null);
      setColSearch('');
    } else {
      setFilterCol(key);
      setColSearch('');
    }
  };

  const sorted = useMemo(() => {
    let data = [...records];

    // Column text filter
    if (filterCol && colSearch) {
      const s = colSearch.toLowerCase();
      data = data.filter((r) => {
        const v = r[filterCol];
        return v != null && String(v).toLowerCase().includes(s);
      });
    }

    // Sort
    if (sortKey) {
      data.sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === 'number' && typeof bv === 'number') {
          return sortDir === 'asc' ? av - bv : bv - av;
        }
        const as = String(av).toLowerCase();
        const bs = String(bv).toLowerCase();
        if (as < bs) return sortDir === 'asc' ? -1 : 1;
        if (as > bs) return sortDir === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return data;
  }, [records, sortKey, sortDir, filterCol, colSearch]);

  return (
    <div className="overflow-auto flex-1 border border-slate-700 rounded-lg">
      <table className="text-xs font-mono border-collapse w-max min-w-full">
        <thead className="sticky top-0 z-10">
          <tr className="bg-slate-800">
            <th className="px-1.5 py-1.5 border-r border-b border-slate-700 text-center w-8">
              <span className="sr-only">Select</span>
            </th>
            <th className="px-1.5 py-1.5 border-r border-b border-slate-700 text-center text-slate-500 w-8">#</th>
            {columns.map((col) => {
              const isSort = sortKey === col.key;
              const isFilter = filterCol === col.key;
              return (
                <th
                  key={col.key}
                  className="border-r border-b border-slate-700 p-0"
                  style={{ minWidth: col.width }}
                >
                  <div className="flex items-center">
                    {/* Sort button */}
                    <button
                      onClick={() => handleSort(col.key)}
                      className={`flex-1 flex items-center gap-1 px-2 py-1.5 text-left font-semibold whitespace-nowrap transition-colors ${
                        isSort ? 'text-blue-400' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {col.label}
                      <span className="inline-flex flex-col leading-none -space-y-0.5">
                        <svg className={`w-2 h-2 ${isSort && sortDir === 'asc' ? 'text-blue-400' : 'text-slate-600'}`} viewBox="0 0 8 5" fill="currentColor">
                          <path d="M4 0L8 5H0z" />
                        </svg>
                        <svg className={`w-2 h-2 ${isSort && sortDir === 'desc' ? 'text-blue-400' : 'text-slate-600'}`} viewBox="0 0 8 5" fill="currentColor">
                          <path d="M4 5L0 0h8z" />
                        </svg>
                      </span>
                    </button>
                    {/* Filter button */}
                    <button
                      onClick={() => toggleFilter(col.key)}
                      className={`shrink-0 px-1 py-1.5 transition-colors ${
                        isFilter ? 'text-green-400' : 'text-slate-600 hover:text-slate-400'
                      }`}
                      title={`Filter ${col.label}`}
                    >
                      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                      </svg>
                    </button>
                  </div>
                  {/* Inline column filter input */}
                  {isFilter && (
                    <div className="px-1 pb-1">
                      <input
                        autoFocus
                        type="text"
                        value={colSearch}
                        onChange={(e) => setColSearch(e.target.value)}
                        placeholder={`Filter ${col.label}...`}
                        className="w-full bg-slate-900 border border-slate-600 rounded px-1.5 py-0.5 text-[10px] text-white placeholder-slate-500 focus:outline-none focus:border-green-500"
                      />
                    </div>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((rec, idx) => (
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
                  display = new Date(val).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
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
          {sorted.length === 0 && (
            <tr>
              <td colSpan={columns.length + 2} className="px-4 py-6 text-center text-slate-500 text-xs">
                No records match the column filter
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default ScrapExcelView;
