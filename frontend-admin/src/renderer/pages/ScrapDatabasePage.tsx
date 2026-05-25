import React, { useEffect, useCallback, useState } from 'react';
import { useScrapDatabaseStore, type ViewMode } from '../store/useScrapDatabaseStore';
import { exportCSV, exportExcel } from '../lib/export';
import api from '../lib/api';
import Pagination from '../components/Pagination';
import Spinner from '../components/Spinner';
import ScrapTableView from '../components/ScrapTableView';
import ScrapCardView from '../components/ScrapCardView';
import ScrapExcelView from '../components/ScrapExcelView';
import MultiSelect from '../components/MultiSelect';
import { useWebsiteAnalysisStore } from '../store/useWebsiteAnalysisStore';
import type { Route } from '../components/Sidebar';

const viewModes: { mode: ViewMode; label: string; icon: React.ReactNode }[] = [
  {
    mode: 'table',
    label: 'Table',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
      </svg>
    ),
  },
  {
    mode: 'card',
    label: 'Card',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
      </svg>
    ),
  },
  {
    mode: 'excel',
    label: 'Excel',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M3 6h18M3 18h18M8 6v12M16 6v12" />
      </svg>
    ),
  },
];

interface ScrapDatabasePageProps {
  onNavigate?: (route: Route) => void;
}

const ScrapDatabasePage: React.FC<ScrapDatabasePageProps> = ({ onNavigate }) => {
  const {
    records, total, page, limit, loading,
    filters, filterOptions, viewMode, selectedIds, selectAllPages,
    fetchRecords, fetchFilterOptions, setFilters, clearFilters,
    setViewMode, setLimit,
    toggleSelect, selectPage, selectAll, clearSelection,
    softDeleteSelected, softDeleteAllFiltered,
    fixNumbers,
  } = useScrapDatabaseStore();

  const startWebsiteAnalysis = useWebsiteAnalysisStore((s) => s.start);
  const wasStarting = useWebsiteAnalysisStore((s) => s.starting);
  const [waBanner, setWaBanner] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(null);

  const handleStartWebsiteAnalysis = async () => {
    const result = await startWebsiteAnalysis();
    if (!result.success) {
      setWaBanner({ kind: 'err', text: result.error || 'Failed to start' });
      return;
    }
    setWaBanner({
      kind: result.alreadyRunning ? 'warn' : 'ok',
      text: result.alreadyRunning
        ? 'A website-analysis job is already in progress — open the page to see progress.'
        : 'Website-analysis job started — open the page to track progress.',
    });
  };

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteMode, setDeleteMode] = useState<'selected' | 'filtered'>('selected');
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [fixingNumbers, setFixingNumbers] = useState(false);
  const [fixResult, setFixResult] = useState<{ scanned: number; modified: number } | null>(null);

  // "Delete Empty" — long-running backend job (3M+ rows at peak). The synchronous
  // PATCH variant we shipped in 1.8.2 worked up to ~50k rows then HTTP-timed-out
  // mid-delete and left no progress feedback. v1.8.3 wraps the same logic in a
  // tracked job: POST /start kicks off a backend worker, the modal polls
  // GET /jobs/:id every 2s for a live deleted/total counter. Closing the modal
  // doesn't cancel the run; it keeps going on the server.
  interface DeleteEmptyJob {
    _id: string;
    status: 'queued' | 'running' | 'completed' | 'error' | 'stopped';
    totalToDelete: number;
    deleted: number;
    errored: number;
    errorMessage?: string;
    startedAt?: string;
    completedAt?: string;
    lastProgressAt?: string;
  }

  const [showDeleteEmptyModal, setShowDeleteEmptyModal] = useState(false);
  const [emptyCount, setEmptyCount] = useState<number | null>(null);
  const [countingEmpty, setCountingEmpty] = useState(false);
  const [deleteEmptyJob, setDeleteEmptyJob] = useState<DeleteEmptyJob | null>(null);
  const [deleteEmptyStarting, setDeleteEmptyStarting] = useState(false);

  // Live job-polling effect — runs only while the modal is open AND a job is
  // active. Stops itself when the job lands in completed/error/stopped, then
  // does one final refresh of the records list.
  useEffect(() => {
    if (!showDeleteEmptyModal || !deleteEmptyJob) return;
    if (['completed', 'error', 'stopped'].includes(deleteEmptyJob.status)) return;

    const id = setInterval(async () => {
      try {
        const res = await api.get(`/api/admin/scrap-database/delete-empty/jobs/${deleteEmptyJob._id}`);
        const fresh = res.data as DeleteEmptyJob;
        setDeleteEmptyJob(fresh);
        if (['completed', 'error', 'stopped'].includes(fresh.status)) {
          fetchRecords(1);  // refresh the table once the run terminates
        }
      } catch (_) {
        // Network blip — keep the last-known state on screen and try again
        // on the next tick. The operator can still close the modal manually.
      }
    }, 2000);
    return () => clearInterval(id);
  }, [showDeleteEmptyModal, deleteEmptyJob?._id, deleteEmptyJob?.status, fetchRecords]);

  const openDeleteEmptyModal = async () => {
    setShowDeleteEmptyModal(true);
    setEmptyCount(null);
    setDeleteEmptyJob(null);
    setCountingEmpty(true);

    try {
      // Two queries in parallel: (a) count what would be deleted, (b) detect
      // an already-running job from a previous tab / browser refresh.
      const [countRes, activeRes] = await Promise.all([
        api.get('/api/admin/scrap-database', {
          params: { missingPhone: 'true', missingEmail: 'true', missingWebsite: 'true', page: 1, limit: 1 },
        }),
        // POST /start with no actual side effect: if a job is already running
        // it returns it; if not it would start one — but we'd rather show the
        // confirm UI first, so we only call this on the explicit confirm.
        // Instead, peek at the latest job via /jobs?limit=1.
        api.get('/api/admin/scrap-database/delete-empty/jobs', { params: { page: 1, limit: 1 } }),
      ]);
      setEmptyCount(Number(countRes.data?.total) || 0);

      const latest = activeRes.data?.data?.[0] as DeleteEmptyJob | undefined;
      if (latest && ['queued', 'running'].includes(latest.status)) {
        // Pick up an in-flight job — modal goes straight into progress mode.
        setDeleteEmptyJob(latest);
      }
    } catch (err) {
      setEmptyCount(0);
      alert(`Failed to load delete-empty status: ${(err as Error).message || 'Unknown'}`);
    } finally {
      setCountingEmpty(false);
    }
  };

  const startDeleteEmptyJob = async () => {
    setDeleteEmptyStarting(true);
    try {
      const res = await api.post('/api/admin/scrap-database/delete-empty/start');
      setDeleteEmptyJob(res.data?.job as DeleteEmptyJob);
    } catch (err) {
      alert(`Failed to start delete-empty job: ${(err as Error).message || 'Unknown'}`);
    } finally {
      setDeleteEmptyStarting(false);
    }
  };

  const closeDeleteEmptyModal = () => {
    setShowDeleteEmptyModal(false);
    setEmptyCount(null);
    setDeleteEmptyJob(null);
  };

  useEffect(() => {
    fetchFilterOptions();
    fetchRecords(1);
  }, []);

  const handleSearch = useCallback(() => {
    fetchRecords(1);
  }, [fetchRecords]);

  const handleClear = () => {
    clearFilters();
    setTimeout(() => fetchRecords(1), 0);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      if (deleteMode === 'selected') {
        await softDeleteSelected();
      } else {
        await softDeleteAllFiltered();
      }
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const ids = selectedIds.size > 0 && !selectAllPages ? Array.from(selectedIds) : undefined;
      await exportCSV(filters, ids);
    } catch (err) {
      alert((err as Error).message || 'CSV export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const ids = selectedIds.size > 0 && !selectAllPages ? Array.from(selectedIds) : undefined;
      await exportExcel(filters, ids);
    } catch (err) {
      alert((err as Error).message || 'Excel export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleFixNumbers = async () => {
    if (fixingNumbers) return;
    if (!confirm('Normalize every unfixed phone number in the database? This cleans spaces/hyphens, drops leading zeros, and prefixes +91 for Indian numbers. Safe to re-run.')) return;
    setFixingNumbers(true);
    setFixResult(null);
    try {
      const result = await fixNumbers();
      setFixResult(result);
    } catch (err) {
      alert(`Failed to fix numbers: ${(err as Error).message || 'Unknown error'}`);
    } finally {
      setFixingNumbers(false);
    }
  };

  const selectionCount = selectAllPages ? total : selectedIds.size;
  const hasFilters = !!(filters.search || filters.category?.length || filters.scrapCategory?.length || filters.scrapSubCategory?.length || filters.pincode?.length || filters.missingPhone || filters.missingAddress || filters.missingWebsite || filters.missingEmail || filters.hasPhone || filters.hasAddress || filters.hasWebsite || filters.hasEmail || filters.minRating != null || filters.maxRating != null || filters.minReviews != null || filters.maxReviews != null || filters.scrapWebsite != null);

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Scrap Database</h2>
          <p className="text-sm text-slate-500 mt-0.5">{total.toLocaleString()} records</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex bg-slate-800 rounded-lg p-0.5">
            {viewModes.map((vm) => (
              <button
                key={vm.mode}
                onClick={() => setViewMode(vm.mode)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  viewMode === vm.mode
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
                title={vm.label}
              >
                {vm.icon}
                <span className="hidden sm:inline">{vm.label}</span>
              </button>
            ))}
          </div>

          {/* Export buttons */}
          <button
            onClick={handleExportCSV}
            disabled={exporting}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 text-xs font-medium px-3 py-2 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            CSV
          </button>
          <button
            onClick={handleExportExcel}
            disabled={exporting}
            className="flex items-center gap-1.5 bg-green-800 hover:bg-green-700 disabled:opacity-50 text-green-100 text-xs font-medium px-3 py-2 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Excel
          </button>

          {/* Fix Numbers (backfill phone normalization) */}
          <button
            onClick={handleFixNumbers}
            disabled={fixingNumbers}
            title="Normalize every unfixed phone number (strip spaces/hyphens, drop leading 0, prefix +91). Safe to re-run."
            className="flex items-center gap-1.5 bg-indigo-800 hover:bg-indigo-700 disabled:opacity-50 text-indigo-100 text-xs font-medium px-3 py-2 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.95.69l1.1 3.29a1 1 0 01-.5 1.21l-2.26 1.13a11 11 0 005.1 5.1l1.13-2.26a1 1 0 011.21-.5l3.29 1.1a1 1 0 01.69.95V19a2 2 0 01-2 2h-1C9.72 21 3 14.28 3 6V5z" />
            </svg>
            {fixingNumbers ? 'Fixing…' : 'Fix Numbers'}
          </button>

          {/* Website Analysis (kicks the dedup job and surfaces it in a banner) */}
          <button
            onClick={handleStartWebsiteAnalysis}
            disabled={wasStarting}
            title="Start the website-dedup analysis job and review progress on the Website Analysis page"
            className="flex items-center gap-1.5 bg-violet-800 hover:bg-violet-700 disabled:opacity-50 text-violet-100 text-xs font-medium px-3 py-2 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 010 18M12 3a15 15 0 000 18" />
            </svg>
            {wasStarting ? 'Starting…' : 'Website Analysis'}
          </button>

          {/* Delete junk — records with NO phone, email, AND website.
              Runs as a backend job — modal shows live progress so a 3M-row
              run doesn't lock the UI. */}
          <button
            onClick={openDeleteEmptyModal}
            disabled={total === 0}
            title="Soft-delete every record that has NO phone, NO email, AND NO website. Runs in the background — you can close the modal and the job keeps going."
            className="flex items-center gap-1.5 bg-rose-800 hover:bg-rose-700 disabled:opacity-50 text-rose-100 text-xs font-medium px-3 py-2 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete Empty
          </button>

          {/* Refresh */}
          <button
            onClick={() => fetchRecords(page)}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium px-3 py-2 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {fixResult && (
        <div className="flex items-center justify-between bg-indigo-950/40 border border-indigo-800/60 rounded-lg px-3 py-2 text-xs text-indigo-200">
          <span>
            Number Fixing complete — scanned <strong>{fixResult.scanned.toLocaleString()}</strong>,
            normalized <strong>{fixResult.modified.toLocaleString()}</strong> record(s).
          </span>
          <button
            onClick={() => setFixResult(null)}
            className="text-indigo-400 hover:text-white"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {waBanner && (
        <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs border ${
          waBanner.kind === 'ok'   ? 'bg-violet-950/40 border-violet-800/60 text-violet-200' :
          waBanner.kind === 'warn' ? 'bg-amber-950/40 border-amber-800/60 text-amber-200' :
                                     'bg-red-950/40 border-red-800/60 text-red-200'
        }`}>
          <span>{waBanner.text}</span>
          <div className="flex items-center gap-3">
            {onNavigate && (
              <button
                onClick={() => onNavigate('website-analysis')}
                className="font-semibold hover:underline"
              >
                Open Website Analysis →
              </button>
            )}
            <button
              onClick={() => setWaBanner(null)}
              className="hover:text-white"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={filters.search || ''}
          onChange={(e) => setFilters({ search: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search name, phone, email, website..."
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 w-56"
        />
        <MultiSelect
          options={filterOptions.scrapCategories}
          selected={filters.scrapCategory || []}
          onChange={(v) => { setFilters({ scrapCategory: v.length ? v : undefined, scrapSubCategory: undefined }); fetchFilterOptions(v.length ? v : undefined); setTimeout(() => fetchRecords(1), 0); }}
          placeholder="All Categories"
        />
        <MultiSelect
          options={filterOptions.scrapSubCategories}
          selected={filters.scrapSubCategory || []}
          onChange={(v) => { setFilters({ scrapSubCategory: v.length ? v : undefined }); setTimeout(() => fetchRecords(1), 0); }}
          placeholder="All Sub Categories"
        />
        <MultiSelect
          options={filterOptions.categories}
          selected={filters.category || []}
          onChange={(v) => { setFilters({ category: v.length ? v : undefined }); setTimeout(() => fetchRecords(1), 0); }}
          placeholder="Google Category"
        />
        <MultiSelect
          options={filterOptions.pincodes}
          selected={filters.pincode || []}
          onChange={(v) => { setFilters({ pincode: v.length ? v : undefined }); setTimeout(() => fetchRecords(1), 0); }}
          placeholder="All Pincodes"
        />

        {/* Rating filter */}
        <select
          value={filters.minRating != null ? String(filters.minRating) : ''}
          onChange={(e) => {
            const val = e.target.value ? Number(e.target.value) : undefined;
            setFilters({ minRating: val });
            setTimeout(() => fetchRecords(1), 0);
          }}
          className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-blue-500 w-24"
        >
          <option value="">Rating</option>
          {[1, 2, 3, 3.5, 4, 4.5].map((r) => (
            <option key={r} value={r}>{r}+</option>
          ))}
        </select>

        {/* Reviews range */}
        <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5">
          <span className="text-[10px] text-slate-500 font-medium">Reviews</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={filters.minReviews ?? ''}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '');
              setFilters({ minReviews: v !== '' ? Number(v) : undefined });
            }}
            onBlur={() => fetchRecords(1)}
            onKeyDown={(e) => { if (e.key === 'Enter') fetchRecords(1); }}
            onWheel={(e) => (e.target as HTMLInputElement).blur()}
            placeholder="Min"
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white placeholder-slate-600 w-16 focus:outline-none focus:border-blue-500 text-center"
          />
          <span className="text-slate-600 text-xs">–</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={filters.maxReviews ?? ''}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '');
              setFilters({ maxReviews: v !== '' ? Number(v) : undefined });
            }}
            onBlur={() => fetchRecords(1)}
            onKeyDown={(e) => { if (e.key === 'Enter') fetchRecords(1); }}
            onWheel={(e) => (e.target as HTMLInputElement).blur()}
            placeholder="Max"
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white placeholder-slate-600 w-16 focus:outline-none focus:border-blue-500 text-center"
          />
        </div>

        {/* Data filters — cycle: off → missing → available */}
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2">
          {[
            { field: 'Phone', missingKey: 'missingPhone' as const, hasKey: 'hasPhone' as const },
            { field: 'Address', missingKey: 'missingAddress' as const, hasKey: 'hasAddress' as const },
            { field: 'Website', missingKey: 'missingWebsite' as const, hasKey: 'hasWebsite' as const },
            { field: 'Email', missingKey: 'missingEmail' as const, hasKey: 'hasEmail' as const },
          ].map(({ field, missingKey, hasKey }) => {
            const isMissing = !!filters[missingKey];
            const isHas = !!filters[hasKey];
            // Cycle: off → missing → available → off
            const handleClick = () => {
              if (!isMissing && !isHas) {
                // off → missing
                setFilters({ [missingKey]: true, [hasKey]: undefined });
              } else if (isMissing) {
                // missing → available
                setFilters({ [missingKey]: undefined, [hasKey]: true });
              } else {
                // available → off
                setFilters({ [missingKey]: undefined, [hasKey]: undefined });
              }
              setTimeout(() => fetchRecords(1), 0);
            };

            let btnClass = 'bg-slate-800 text-slate-500 hover:text-slate-300';
            let label = field;
            if (isMissing) {
              btnClass = 'bg-red-900/50 text-red-300 ring-1 ring-red-700/60';
              label = `No ${field}`;
            } else if (isHas) {
              btnClass = 'bg-green-900/50 text-green-300 ring-1 ring-green-700/60';
              label = `Has ${field}`;
            }

            return (
              <button
                key={field}
                onClick={handleClick}
                className={`text-xs font-medium px-2.5 py-1 rounded-md transition-all ${btnClass}`}
                title={isMissing ? `Showing: missing ${field.toLowerCase()}` : isHas ? `Showing: has ${field.toLowerCase()}` : `Click to filter by ${field.toLowerCase()}`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Website scraped filter */}
        <button
          onClick={() => {
            const next = filters.scrapWebsite === true ? false : filters.scrapWebsite === false ? undefined : true;
            setFilters({ scrapWebsite: next });
            setTimeout(() => fetchRecords(1), 0);
          }}
          className={`text-xs font-medium px-2.5 py-1.5 rounded-lg transition-all ${
            filters.scrapWebsite === true
              ? 'bg-emerald-900/50 text-emerald-300 ring-1 ring-emerald-700/60'
              : filters.scrapWebsite === false
              ? 'bg-orange-900/50 text-orange-300 ring-1 ring-orange-700/60'
              : 'bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-300'
          }`}
          title="Filter by website scrape status"
        >
          {filters.scrapWebsite === true ? 'Web Scraped' : filters.scrapWebsite === false ? 'Not Web Scraped' : 'Web Scrape'}
        </button>

        {/* Page size */}
        <select
          value={limit}
          onChange={(e) => { setLimit(Number(e.target.value)); setTimeout(() => fetchRecords(1), 0); }}
          className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
        >
          {[10, 25, 50, 100].map((n) => (
            <option key={n} value={n}>{n} / page</option>
          ))}
        </select>

        <button
          onClick={handleSearch}
          className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          Search
        </button>
        {hasFilters && (
          <button onClick={handleClear} className="text-slate-400 hover:text-white text-sm transition-colors">
            Clear
          </button>
        )}
      </div>

      {/* Selection bar */}
      {(selectionCount > 0) && (
        <div className="flex items-center gap-3 bg-blue-900/20 border border-blue-800/40 rounded-lg px-4 py-2.5">
          <span className="text-sm text-blue-300 font-medium">
            {selectAllPages ? `All ${total.toLocaleString()} records` : `${selectionCount} selected`}
          </span>
          <div className="h-4 w-px bg-blue-800/60" />
          <button onClick={selectPage} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
            Select This Page
          </button>
          <button
            onClick={selectAll}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            Select All ({total.toLocaleString()})
          </button>
          <button onClick={clearSelection} className="text-xs text-slate-400 hover:text-white transition-colors">
            Unselect All
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => { setDeleteMode('selected'); setShowDeleteModal(true); }}
              className="flex items-center gap-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete Selected
            </button>
            {hasFilters && (
              <button
                onClick={() => { setDeleteMode('filtered'); setShowDeleteModal(true); }}
                className="flex items-center gap-1.5 bg-red-900/60 hover:bg-red-800 text-red-200 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
              >
                Delete All Filtered
              </button>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex-1 flex flex-col min-h-0">
        {loading && records.length === 0 ? (
          <div className="p-8 flex justify-center"><Spinner message="Loading records..." /></div>
        ) : records.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">No records found</div>
        ) : (
          <>
            {viewMode === 'table' && (
              <ScrapTableView records={records} selectedIds={selectedIds} onToggleSelect={toggleSelect} />
            )}
            {viewMode === 'card' && (
              <ScrapCardView records={records} selectedIds={selectedIds} onToggleSelect={toggleSelect} />
            )}
            {viewMode === 'excel' && (
              <ScrapExcelView records={records} selectedIds={selectedIds} onToggleSelect={toggleSelect} />
            )}
            <div className="border-t border-slate-800 px-4 py-2 shrink-0">
              <Pagination page={page} total={total} limit={limit} onPageChange={(p) => fetchRecords(p)} onLimitChange={(l) => { setLimit(l); setTimeout(() => fetchRecords(1), 0); }} />
            </div>
          </>
        )}
      </div>

      {/* Delete-empty modal — 3 stages:
           1. Confirm  — no job yet, ask to start
           2. Running  — job is queued/running, show live progress bar
           3. Done     — job is completed/error/stopped, show summary
           The modal is just a viewer; the backend worker keeps running even
           if the operator clicks "Close & let it run" in state 2. Re-opening
           the modal re-attaches to the in-flight job via the /jobs poll. */}
      {showDeleteEmptyModal && (() => {
        const job = deleteEmptyJob;
        const isRunning = job && (job.status === 'queued' || job.status === 'running');
        const isDone = job && (job.status === 'completed' || job.status === 'error' || job.status === 'stopped');
        const pct = job && job.totalToDelete > 0
          ? Math.min(100, Math.round((job.deleted / job.totalToDelete) * 100))
          : 0;

        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl bg-rose-500/15 flex items-center justify-center shrink-0 mt-0.5">
                  <svg className="w-5 h-5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {isDone   ? 'Delete-Empty job finished'
                    : isRunning ? 'Delete-Empty running in background'
                    :             'Delete records with no contact info?'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Targets every row where <strong className="text-slate-300">phone</strong>,{' '}
                    <strong className="text-slate-300">email</strong> AND{' '}
                    <strong className="text-slate-300">website</strong> are all empty.
                  </p>
                </div>
              </div>

              {/* ── Stage 1: confirm (no job yet) ── */}
              {!job && (
                <>
                  <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 mb-4">
                    {countingEmpty ? (
                      <p className="text-sm text-slate-400">Counting records…</p>
                    ) : (
                      <p className="text-sm text-slate-200">
                        <strong className="text-rose-300">{(emptyCount ?? 0).toLocaleString()}</strong>{' '}
                        record{emptyCount === 1 ? '' : 's'} will be moved to{' '}
                        <span className="font-mono text-slate-400">Scraped-Data-Deleted</span>.
                        <br />
                        <span className="text-xs text-slate-500">
                          Restorable from the Deleted Records page with the admin password. The job runs on the server — you can close this modal and it keeps going.
                        </span>
                      </p>
                    )}
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={startDeleteEmptyJob}
                      disabled={deleteEmptyStarting || countingEmpty || (emptyCount ?? 0) === 0}
                      className="flex-1 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
                    >
                      {deleteEmptyStarting
                        ? 'Starting…'
                        : countingEmpty
                          ? 'Counting…'
                          : (emptyCount ?? 0) === 0
                            ? 'Nothing to delete'
                            : `Start delete (${(emptyCount ?? 0).toLocaleString()})`}
                    </button>
                    <button
                      onClick={closeDeleteEmptyModal}
                      disabled={deleteEmptyStarting}
                      className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}

              {/* ── Stage 2: running (job queued or in progress) ── */}
              {isRunning && (
                <>
                  <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 mb-3">
                    <div className="flex justify-between items-baseline mb-1.5">
                      <span className="text-xs text-slate-400">
                        {job.deleted.toLocaleString()} of {job.totalToDelete.toLocaleString()} processed
                      </span>
                      <span className="text-sm font-bold text-rose-300 tabular-nums">{pct}%</span>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-rose-500 rounded-full transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-2">
                      Status: <span className="font-mono text-slate-400">{job.status}</span>
                      {job.errored > 0 && (
                        <> · <span className="text-amber-400">{job.errored.toLocaleString()} errored</span></>
                      )}
                      {' · polling every 2 s'}
                    </p>
                  </div>

                  <div className="bg-slate-950/40 border border-slate-800/60 rounded-lg p-2.5 mb-4">
                    <p className="text-[11px] text-slate-400 leading-snug">
                      <strong className="text-slate-300">Safe to close.</strong> The job runs on the server.
                      Re-open this modal any time to check progress — the next page-refresh will reconnect to the running job.
                    </p>
                  </div>

                  <button
                    onClick={closeDeleteEmptyModal}
                    className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium py-2.5 rounded-lg transition-colors"
                  >
                    Close & let it run
                  </button>
                </>
              )}

              {/* ── Stage 3: done (completed / error / stopped) ── */}
              {isDone && (
                <>
                  <div className={`border rounded-lg p-3 mb-4 ${
                    job.status === 'completed'
                      ? 'bg-emerald-950/40 border-emerald-800/60'
                      : 'bg-amber-950/40 border-amber-800/60'
                  }`}>
                    <p className={`text-sm font-semibold ${
                      job.status === 'completed' ? 'text-emerald-300' : 'text-amber-300'
                    }`}>
                      {job.status === 'completed' ? '✓ Completed' : `⚠ ${job.status}`}
                    </p>
                    <p className="text-sm text-slate-300 mt-1">
                      Deleted <strong className="text-rose-300">{job.deleted.toLocaleString()}</strong>{' '}
                      of {job.totalToDelete.toLocaleString()} record{job.totalToDelete === 1 ? '' : 's'}.
                      {job.errored > 0 && (
                        <> <span className="text-amber-300">{job.errored.toLocaleString()} errored.</span></>
                      )}
                    </p>
                    {job.errorMessage && (
                      <p className="text-[11px] text-amber-300/80 font-mono mt-1.5 break-all">
                        {job.errorMessage}
                      </p>
                    )}
                    <p className="text-[11px] text-slate-500 mt-2">
                      Rows are in <span className="font-mono">Scraped-Data-Deleted</span> — restorable
                      from the Deleted Records page.
                    </p>
                  </div>

                  <button
                    onClick={closeDeleteEmptyModal}
                    className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium py-2.5 rounded-lg transition-colors"
                  >
                    Close
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-base font-bold text-white mb-2">Confirm Delete</h3>
            <p className="text-sm text-slate-400 mb-1">
              {deleteMode === 'selected'
                ? `Soft-delete ${selectAllPages ? total.toLocaleString() : selectionCount} selected record${selectionCount !== 1 ? 's' : ''}?`
                : `Soft-delete all ${total.toLocaleString()} records matching current filters?`
              }
            </p>
            <p className="text-xs text-slate-500 mb-5">
              Records will be marked as deleted but not permanently removed.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium py-2.5 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScrapDatabasePage;
