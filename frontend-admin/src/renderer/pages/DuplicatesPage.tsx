import React, { useEffect, useState, useCallback } from 'react';
import { useDuplicatesStore } from '../store/useDuplicatesStore';
import Pagination from '../components/Pagination';
import Spinner from '../components/Spinner';
import type { ScrapedDataRecord } from '../../shared/types';

// ── Shared table component ─────────────────────────────────────────────────

interface DupTableProps {
  records: ScrapedDataRecord[];
  showMovedAt?: boolean;
}

const DupTable: React.FC<DupTableProps> = ({ records, showMovedAt }) => {
  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <svg className="w-12 h-12 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-sm">No records found</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead>
          <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider">
            <th className="px-4 py-3 font-medium">#</th>
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 font-medium">Phone</th>
            <th className="px-4 py-3 font-medium">Website</th>
            <th className="px-4 py-3 font-medium">Address</th>
            <th className="px-4 py-3 font-medium">Category</th>
            <th className="px-4 py-3 font-medium">Pincode</th>
            <th className="px-4 py-3 font-medium">Keyword</th>
            {showMovedAt && <th className="px-4 py-3 font-medium">Moved At</th>}
            <th className="px-4 py-3 font-medium">Scraped At</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60">
          {records.map((r, i) => (
            <tr key={r._id} className="hover:bg-slate-800/40 transition-colors">
              <td className="px-4 py-3 text-slate-500 text-xs">{i + 1}</td>
              <td className="px-4 py-3">
                <span className="text-slate-200 font-medium line-clamp-1 max-w-[160px] block" title={r.name}>
                  {r.name || <span className="text-slate-600 italic">—</span>}
                </span>
              </td>
              <td className="px-4 py-3">
                {r.phone ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="text-blue-400 font-mono text-xs">{r.phone}</span>
                    {r.numberFixing && (
                      <span
                        title="Number normalized (+91 format)"
                        className="text-[9px] uppercase font-semibold text-indigo-300 bg-indigo-900/50 border border-indigo-700/60 rounded px-1 py-px"
                      >
                        Fixed
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-slate-600 italic text-xs">—</span>
                )}
              </td>
              <td className="px-4 py-3 max-w-[140px]">
                {r.website
                  ? <span className="text-emerald-400 text-xs truncate block" title={r.website}>{r.website}</span>
                  : <span className="text-slate-600 italic text-xs">—</span>}
              </td>
              <td className="px-4 py-3 max-w-[180px]">
                <span className="text-slate-400 text-xs line-clamp-2 block" title={r.address}>
                  {r.address || <span className="text-slate-600 italic">—</span>}
                </span>
              </td>
              <td className="px-4 py-3">
                {r.category
                  ? <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">{r.category}</span>
                  : <span className="text-slate-600 italic text-xs">—</span>}
              </td>
              <td className="px-4 py-3 text-slate-400 text-xs font-mono">{r.pincode || '—'}</td>
              <td className="px-4 py-3 text-slate-400 text-xs max-w-[120px]">
                <span className="block truncate" title={r.scrapKeyword}>{r.scrapKeyword || '—'}</span>
              </td>
              {showMovedAt && (
                <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                  {(r as any).movedAt ? new Date((r as any).movedAt).toLocaleString() : '—'}
                </td>
              )}
              <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                {r.scrapedAt || (r.createdAt ? new Date(r.createdAt).toLocaleString() : '—')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ── Main Page ──────────────────────────────────────────────────────────────

const DuplicatesPage: React.FC = () => {
  const {
    records, total, page, limit, loading, search,
    archiveRecords, archiveTotal, archivePage, archiveLoading, archiveSearch,
    analyzing, analyzeResult, deleting, deleteResult,
    restoring, restoreResult, activeTab,
    fetchRecords, fetchArchive,
    setSearch, setArchiveSearch, setLimit, setTab,
    runAnalysis, clearAnalyzeResult,
    runDeleteByPNA, clearDeleteResult,
    runRestoreAll, clearRestoreResult,
  } = useDuplicatesStore();

  const [showConfirm, setShowConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [archiveSearchInput, setArchiveSearchInput] = useState('');

  useEffect(() => {
    fetchRecords(1);
    fetchArchive(1);
  }, []);

  const handleSearch = useCallback(() => {
    setSearch(searchInput);
    setTimeout(() => fetchRecords(1), 0);
  }, [searchInput, setSearch, fetchRecords]);

  const handleArchiveSearch = useCallback(() => {
    setArchiveSearch(archiveSearchInput);
    setTimeout(() => fetchArchive(1), 0);
  }, [archiveSearchInput, setArchiveSearch, fetchArchive]);

  const handleAnalyzeConfirm = async () => {
    setShowConfirm(false);
    await runAnalysis();
  };

  const handleDeleteConfirm = async () => {
    setShowDeleteConfirm(false);
    await runDeleteByPNA();
  };

  const handleRestoreConfirm = async () => {
    setShowRestoreConfirm(false);
    await runRestoreAll();
  };

  return (
    <div className="p-6 space-y-6 min-h-0">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-orange-500/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold text-white leading-tight">Duplicates</h1>
            <p className="text-xs text-slate-500 mt-0.5">Records flagged as duplicates and analyzed exact matches</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Restore All button */}
          <button
            onClick={() => setShowRestoreConfirm(true)}
            disabled={restoring || deleting || analyzing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors shadow-lg shadow-emerald-900/30"
          >
            {restoring ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Restoring...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Restore All
              </>
            )}
          </button>

          {/* Delete by Phone+Name+Address button */}
          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={deleting || analyzing || restoring}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors shadow-lg shadow-red-900/30"
          >
            {deleting ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Deleting...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete Duplicates
              </>
            )}
          </button>

          {/* Analyze button */}
          <button
            onClick={() => setShowConfirm(true)}
            disabled={analyzing || deleting || restoring}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors shadow-lg shadow-orange-900/30"
          >
            {analyzing ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Analyzing...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Analyze Duplicates
              </>
            )}
          </button>
        </div>
      </div>

      {/* Analysis result banner */}
      {analyzeResult && (
        <div className="flex items-center justify-between bg-blue-500/10 border border-blue-500/30 rounded-xl px-5 py-3.5">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <div>
              <p className="text-sm text-blue-300 font-semibold">Analysis complete</p>
              <p className="text-xs text-blue-400/70 mt-0.5">
                <span className="font-mono">Scraped-Data</span>: <strong>{analyzeResult.mainTotal.toLocaleString()}</strong> total &mdash;{' '}
                <strong>{analyzeResult.flaggedCount.toLocaleString()}</strong> flagged as duplicate
                &emsp;|&emsp;
                <span className="font-mono">Archive</span>: <strong>{analyzeResult.archiveTotal.toLocaleString()}</strong> records
              </p>
            </div>
          </div>
          <button onClick={clearAnalyzeResult} className="text-slate-500 hover:text-slate-300 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Restore result banner */}
      {restoreResult && (
        <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-5 py-3.5">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm text-emerald-300 font-semibold">Restore complete</p>
              <p className="text-xs text-emerald-400/70 mt-0.5">
                Restored <strong>{restoreResult.restoredCount.toLocaleString()}</strong> records back to{' '}
                <span className="font-mono">Scraped-Data</span>. Archive is now empty.
              </p>
            </div>
          </div>
          <button onClick={clearRestoreResult} className="text-slate-500 hover:text-slate-300 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Delete result banner */}
      {deleteResult && (
        <div className="flex items-center justify-between bg-red-500/10 border border-red-500/30 rounded-xl px-5 py-3.5">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm text-red-300 font-semibold">Delete complete</p>
              <p className="text-xs text-red-400/70 mt-0.5">
                Found <strong>{deleteResult.groupCount}</strong> duplicate groups (Phone + Name + Address) &mdash; moved{' '}
                <strong>{deleteResult.movedCount}</strong> records to <span className="font-mono">Scraped-Data-Duplicate</span>.
                All <span className="font-mono">isDuplicate</span> fields removed.
              </p>
            </div>
          </div>
          <button onClick={clearDeleteResult} className="text-slate-500 hover:text-slate-300 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold text-white">{total.toLocaleString()}</p>
            <p className="text-xs text-slate-500 mt-0.5">Flagged duplicates</p>
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold text-white">{archiveTotal.toLocaleString()}</p>
            <p className="text-xs text-slate-500 mt-0.5">Archived exact duplicates</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-900/60 border border-slate-800 rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab('flagged')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'flagged'
              ? 'bg-orange-500 text-white shadow'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          Flagged Duplicates
          <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
            activeTab === 'flagged' ? 'bg-white/20 text-white' : 'bg-slate-700 text-slate-400'
          }`}>
            {total.toLocaleString()}
          </span>
        </button>
        <button
          onClick={() => setTab('archive')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'archive'
              ? 'bg-purple-500 text-white shadow'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          Archive
          <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
            activeTab === 'archive' ? 'bg-white/20 text-white' : 'bg-slate-700 text-slate-400'
          }`}>
            {archiveTotal.toLocaleString()}
          </span>
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'flagged' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          {/* Search + controls */}
          <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search name, phone, address..."
                className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <button
              onClick={handleSearch}
              className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
            >
              Search
            </button>
            {search && (
              <button
                onClick={() => { setSearchInput(''); setSearch(''); setTimeout(() => fetchRecords(1), 0); }}
                className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm transition-colors"
              >
                Clear
              </button>
            )}
            <span className="ml-auto text-xs text-slate-500">{total.toLocaleString()} records</span>
          </div>

          {loading ? (
            <div className="py-16">
              <Spinner message="Loading duplicates..." />
            </div>
          ) : (
            <>
              <DupTable records={records} showMovedAt={false} />
              <div className="px-4 py-3 border-t border-slate-800">
                <Pagination
                  page={page}
                  total={total}
                  limit={limit}
                  onPageChange={(p) => fetchRecords(p)}
                  onLimitChange={(l) => { setLimit(l); setTimeout(() => fetchRecords(1), 0); }}
                />
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'archive' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          {/* Archive header */}
          <div className="px-4 py-3 border-b border-slate-800">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
              <span className="text-sm font-semibold text-white">Scraped-Data-Duplicate Collection</span>
            </div>
            <p className="text-xs text-slate-500">
              Records moved here by the Analyze Duplicates action — exact matches on name + phone + website + address.
            </p>
          </div>

          {/* Search */}
          <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={archiveSearchInput}
                onChange={(e) => setArchiveSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleArchiveSearch()}
                placeholder="Search name, phone, address..."
                className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>
            <button
              onClick={handleArchiveSearch}
              className="px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium transition-colors"
            >
              Search
            </button>
            {archiveSearch && (
              <button
                onClick={() => { setArchiveSearchInput(''); setArchiveSearch(''); setTimeout(() => fetchArchive(1), 0); }}
                className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm transition-colors"
              >
                Clear
              </button>
            )}
            <span className="ml-auto text-xs text-slate-500">{archiveTotal.toLocaleString()} records</span>
          </div>

          {archiveLoading ? (
            <div className="py-16">
              <Spinner message="Loading archive..." />
            </div>
          ) : (
            <>
              <DupTable records={archiveRecords} showMovedAt={true} />
              <div className="px-4 py-3 border-t border-slate-800">
                <Pagination
                  page={archivePage}
                  total={archiveTotal}
                  limit={limit}
                  onPageChange={(p) => fetchArchive(p)}
                  onLimitChange={(l) => { setLimit(l); setTimeout(() => fetchArchive(1), 0); }}
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* Delete by Phone+Name+Address confirm modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-start gap-4 mb-5">
              <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0 mt-0.5">
                <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Delete Duplicates by Phone + Name + Address?</h2>
                <p className="text-sm text-slate-400 mt-1 leading-relaxed">
                  <strong className="text-slate-200">Step 1:</strong> Clears the{' '}
                  <span className="font-mono text-slate-300">isDuplicate</span> field from all records.
                  <br />
                  <strong className="text-slate-200">Step 2:</strong> Finds records where{' '}
                  <strong className="text-slate-200">phone + name + address</strong> all match (case-insensitive).
                  The <strong className="text-slate-200">oldest record</strong> stays in{' '}
                  <span className="font-mono text-slate-300">Scraped-Data</span>; all others are{' '}
                  <strong className="text-red-300">moved</strong> to{' '}
                  <span className="font-mono text-slate-300">Scraped-Data-Duplicate</span>.
                </p>
                <p className="text-xs text-slate-500 mt-2">This action cannot be undone.</p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors"
              >
                Yes, Delete & Archive
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restore All confirm modal */}
      {showRestoreConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-start gap-4 mb-5">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0 mt-0.5">
                <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Restore All from Archive?</h2>
                <p className="text-sm text-slate-400 mt-1 leading-relaxed">
                  Moves <strong className="text-slate-200">all records</strong> from{' '}
                  <span className="font-mono text-slate-300">Scraped-Data-Duplicate</span> back to{' '}
                  <span className="font-mono text-slate-300">Scraped-Data</span>.
                  Archive-specific fields (<span className="font-mono text-slate-300">movedAt</span>,{' '}
                  <span className="font-mono text-slate-300">originalId</span>) are stripped.
                  No extra flags are added.
                </p>
                <p className="text-xs text-slate-500 mt-2">The archive will be empty after this operation.</p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowRestoreConfirm(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRestoreConfirm}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors"
              >
                Yes, Restore All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-start gap-4 mb-5">
              <div className="w-10 h-10 rounded-xl bg-orange-500/15 flex items-center justify-center shrink-0 mt-0.5">
                <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Run Duplicate Analysis?</h2>
                <p className="text-sm text-slate-400 mt-1 leading-relaxed">
                  Counts records in <span className="font-mono text-slate-300">Scraped-Data</span> (total + flagged as duplicate)
                  and in <span className="font-mono text-slate-300">Scraped-Data-Duplicate</span> (archive).
                  <strong className="text-slate-200"> No records are moved or deleted.</strong> This is a read-only operation.
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAnalyzeConfirm}
                className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-colors"
              >
                Run Analysis
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DuplicatesPage;
