import React, { useEffect, useCallback } from 'react';
import { useScrapedPincodeStore } from '../store/useScrapedPincodeStore';
import Pagination from '../components/Pagination';
import Spinner from '../components/Spinner';

const STATUS_OPTIONS = [
  { value: 'all',       label: 'All'       },
  { value: 'running',   label: 'Running'   },
  { value: 'stop',      label: 'Stopped'   },
  { value: 'completed', label: 'Completed' },
] as const;

const ScrapedPincodesPage: React.FC = () => {
  const {
    pincodes, total, page, limit, loading,
    filters, fetchPincodes, setLimit, setFilters, clearFilters,
  } = useScrapedPincodeStore();

  useEffect(() => {
    fetchPincodes(1);
  }, []);

  const handleSearch = useCallback(() => {
    fetchPincodes(1);
  }, [fetchPincodes]);

  const handleClear = () => {
    clearFilters();
    setTimeout(() => fetchPincodes(1), 0);
  };

  const activeStatus = filters.completionStatus || 'all';

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Scraped Pincodes</h2>
          <p className="text-sm text-slate-500 mt-0.5">{total.toLocaleString()} pincodes scraped</p>
        </div>
        <button
          onClick={() => fetchPincodes(page)}
          className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium px-3 py-2 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={filters.search || ''}
          onChange={(e) => setFilters({ search: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search pincode, district, state..."
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 w-64"
        />

        {/* Status filter */}
        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { setFilters({ completionStatus: opt.value }); setTimeout(() => fetchPincodes(1), 0); }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeStatus === opt.value
                  ? opt.value === 'completed'
                    ? 'bg-emerald-500/20 text-emerald-300 shadow-sm'
                    : opt.value === 'running'
                    ? 'bg-blue-500/20 text-blue-300 shadow-sm'
                    : opt.value === 'stop'
                    ? 'bg-red-500/20 text-red-300 shadow-sm'
                    : 'bg-slate-700 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <button
          onClick={handleSearch}
          className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          Search
        </button>
        {(filters.search || filters.state || activeStatus !== 'all') && (
          <button onClick={handleClear} className="text-slate-400 hover:text-white text-sm transition-colors">
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex-1 flex flex-col min-h-0">
        {loading && pincodes.length === 0 ? (
          <div className="p-8 flex justify-center"><Spinner message="Loading scraped pincodes..." /></div>
        ) : pincodes.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">No scraped pincodes found</div>
        ) : (
          <>
            <div className="overflow-auto flex-1">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-900 z-10">
                  <tr className="border-b border-slate-800">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Pincode</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">District</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">State</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Records</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Categories</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Rounds</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Devices</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {pincodes.map((p) => (
                    <tr key={p.pincode} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 text-blue-300 font-medium whitespace-nowrap">{p.pincode}</td>
                      <td className="px-4 py-3 text-white">{p.district}</td>
                      <td className="px-4 py-3 text-slate-300">{p.stateName}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-900/60 text-blue-300">
                          {p.totalRecords.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1 max-w-[280px]">
                          {p.categories.slice(0, 3).map((c) => (
                            <span key={c} className="text-[11px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded truncate max-w-[100px]">
                              {c}
                            </span>
                          ))}
                          {p.categories.length > 3 && (
                            <span className="text-[11px] text-slate-500">+{p.categories.length - 3}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {p.rounds.map((r) => {
                            const isDone = p.completedRounds?.includes(r);
                            return (
                              <span
                                key={r}
                                className={`text-[11px] px-1.5 py-0.5 rounded ${
                                  isDone
                                    ? 'bg-emerald-900/40 text-emerald-400'
                                    : 'bg-blue-900/30 text-blue-400'
                                }`}
                                title={isDone ? 'All niches done' : 'In progress'}
                              >
                                R{r}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-300">{p.devices.length}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {p.completionStatus === 'completed' ? (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                            Completed
                          </span>
                        ) : p.completionStatus === 'stop' ? (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                            Stopped
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0 animate-pulse" />
                            Running
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-slate-800 px-4 py-2">
              <Pagination page={page} total={total} limit={limit} onPageChange={(p) => fetchPincodes(p)} onLimitChange={(l) => { setLimit(l); setTimeout(() => fetchPincodes(1), 0); }} />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ScrapedPincodesPage;
