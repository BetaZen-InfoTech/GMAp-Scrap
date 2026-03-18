import React, { useEffect, useCallback, useState } from 'react';
import { useScrapDatabaseStore, type ViewMode } from '../store/useScrapDatabaseStore';
import { exportCSV, exportExcel } from '../lib/export';
import Pagination from '../components/Pagination';
import Spinner from '../components/Spinner';
import ScrapTableView from '../components/ScrapTableView';
import ScrapCardView from '../components/ScrapCardView';
import ScrapExcelView from '../components/ScrapExcelView';
import MultiSelect from '../components/MultiSelect';

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

const ScrapDatabasePage: React.FC = () => {
  const {
    records, total, page, limit, loading,
    filters, filterOptions, viewMode, selectedIds, selectAllPages,
    fetchRecords, fetchFilterOptions, setFilters, clearFilters,
    setViewMode, setLimit,
    toggleSelect, selectPage, selectAll, clearSelection,
    softDeleteSelected, softDeleteAllFiltered,
  } = useScrapDatabaseStore();

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteMode, setDeleteMode] = useState<'selected' | 'filtered'>('selected');
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

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
    } finally {
      setExporting(false);
    }
  };

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const ids = selectedIds.size > 0 && !selectAllPages ? Array.from(selectedIds) : undefined;
      await exportExcel(filters, ids);
    } finally {
      setExporting(false);
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

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={filters.search || ''}
          onChange={(e) => setFilters({ search: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search name, keyword, address..."
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
              <Pagination page={page} total={total} limit={limit} onPageChange={(p) => fetchRecords(p)} />
            </div>
          </>
        )}
      </div>

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
