import React, { useEffect, useCallback } from 'react';
import { usePincodeStore } from '../store/usePincodeStore';
import Pagination from '../components/Pagination';
import Spinner from '../components/Spinner';
import MultiSelect from '../components/MultiSelect';

const PincodeDetailsPage: React.FC = () => {
  const {
    pincodes, total, page, limit, loading,
    filters, filterOptions,
    fetchPincodes, fetchFilterOptions, setFilters, clearFilters,
  } = usePincodeStore();

  useEffect(() => {
    fetchFilterOptions();
    fetchPincodes(1);
  }, []);

  const handleSearch = useCallback(() => {
    fetchPincodes(1);
  }, [fetchPincodes]);

  const handleClear = () => {
    clearFilters();
    fetchFilterOptions();
    setTimeout(() => fetchPincodes(1), 0);
  };

  const hasFilters = !!(filters.search || filters.state?.length || filters.district?.length);

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Pincode Details</h2>
          <p className="text-sm text-slate-500 mt-0.5">{total.toLocaleString()} total pincodes</p>
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
        <MultiSelect
          options={filterOptions.states}
          selected={filters.state || []}
          onChange={(v) => {
            setFilters({ state: v.length ? v : undefined, district: undefined });
            fetchFilterOptions(v.length ? v : undefined);
            setTimeout(() => fetchPincodes(1), 0);
          }}
          placeholder="All States"
        />
        <MultiSelect
          options={filterOptions.districts}
          selected={filters.district || []}
          onChange={(v) => {
            setFilters({ district: v.length ? v : undefined });
            setTimeout(() => fetchPincodes(1), 0);
          }}
          placeholder="All Districts"
        />
        <button
          onClick={handleSearch}
          className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          Search
        </button>
        {hasFilters && (
          <button
            onClick={handleClear}
            className="text-slate-400 hover:text-white text-sm transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex-1 flex flex-col min-h-0">
        {loading && pincodes.length === 0 ? (
          <div className="p-8 flex justify-center"><Spinner message="Loading pincodes..." /></div>
        ) : pincodes.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">No pincodes found</div>
        ) : (
          <>
            <div className="overflow-auto flex-1">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-900 z-10">
                  <tr className="border-b border-slate-800">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Pincode</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">District</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">State</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Circle</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Scraped</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Latitude</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Longitude</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Country</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {pincodes.map((p) => (
                    <tr key={p._id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 text-blue-300 font-medium whitespace-nowrap">{p.Pincode}</td>
                      <td className="px-4 py-3 text-white">{p.District || '—'}</td>
                      <td className="px-4 py-3 text-slate-300">{p.StateName || '—'}</td>
                      <td className="px-4 py-3 text-slate-400">{p.CircleName || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {p.scrapedCount ? (
                          <span className="text-xs font-semibold bg-blue-900/60 text-blue-300 px-2 py-0.5 rounded-full">
                            {p.scrapedCount.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-600">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-400 font-mono text-xs">{p.Latitude || '—'}</td>
                      <td className="px-4 py-3 text-slate-400 font-mono text-xs">{p.Longitude || '—'}</td>
                      <td className="px-4 py-3 text-slate-400">{p.Country || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-slate-800 px-4 py-2">
              <Pagination page={page} total={total} limit={limit} onPageChange={(p) => fetchPincodes(p)} />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PincodeDetailsPage;
