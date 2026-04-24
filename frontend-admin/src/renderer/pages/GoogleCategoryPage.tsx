import React, { useEffect, useMemo, useState } from 'react';
import api from '../lib/api';
import Spinner from '../components/Spinner';

interface Niche {
  Category: string;
  SubCategory: string;
}

const GoogleCategoryPage: React.FC = () => {
  const [niches, setNiches] = useState<Niche[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);

  const fetchNiches = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/niches');
      setNiches(Array.isArray(res.data) ? res.data : []);
    } catch {
      setNiches([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchNiches();
  }, []);

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    if (!s) return niches;
    return niches.filter(
      (n) => n.Category.toLowerCase().includes(s) || n.SubCategory.toLowerCase().includes(s)
    );
  }, [niches, search]);

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const n of filtered) {
      if (!map.has(n.Category)) map.set(n.Category, []);
      map.get(n.Category)!.push(n.SubCategory);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const totalCategories = new Set(niches.map((n) => n.Category)).size;
  const totalSubCategories = niches.length;

  const exportExcel = async () => {
    setExporting(true);
    try {
      const XLSX = await import('xlsx');
      const rows = niches.map((n) => ({ Category: n.Category, SubCategory: n.SubCategory }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Google Categories');
      XLSX.writeFile(wb, `google-categories-${Date.now()}.xlsx`);
    } finally {
      setExporting(false);
    }
  };

  const exportCSV = () => {
    const header = 'Category,SubCategory\n';
    const escape = (v: string) => {
      if (v == null) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const body = niches.map((n) => `${escape(n.Category)},${escape(n.SubCategory)}`).join('\n');
    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `google-categories-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading && niches.length === 0) {
    return <Spinner message="Loading Google Categories..." />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Google Category</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {totalCategories} categories &middot; {totalSubCategories} subcategories
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search category or subcategory..."
            className="w-64 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 placeholder:text-slate-600"
          />
          <button
            onClick={exportCSV}
            disabled={niches.length === 0}
            className="text-xs bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export CSV
          </button>
          <button
            onClick={exportExcel}
            disabled={exporting || niches.length === 0}
            className="text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {exporting ? 'Exporting...' : 'Export Excel'}
          </button>
          <button
            onClick={fetchNiches}
            className="text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Grouped list */}
      {grouped.length === 0 ? (
        <p className="text-sm text-slate-500 py-16 text-center">No categories found.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {grouped.map(([category, subs]) => (
            <div key={category} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white truncate" title={category}>
                  {category}
                </h3>
                <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full shrink-0">
                  {subs.length}
                </span>
              </div>
              <div className="space-y-0.5 max-h-64 overflow-y-auto">
                {subs.map((sub) => (
                  <div key={sub} className="text-xs text-slate-300 px-2 py-1 rounded hover:bg-slate-800/60">
                    {sub}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default GoogleCategoryPage;
