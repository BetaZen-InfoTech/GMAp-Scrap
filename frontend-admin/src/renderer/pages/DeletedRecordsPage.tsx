import React, { useEffect, useState, useCallback } from 'react';
import { useDeletedRecordsStore } from '../store/useDeletedRecordsStore';
import Pagination from '../components/Pagination';
import Spinner from '../components/Spinner';
import type { DeletedRecord } from '../store/useDeletedRecordsStore';

type PendingAction =
  | { kind: 'restore-selected'; count: number }
  | { kind: 'restore-all'; count: number }
  | { kind: 'purge-selected'; count: number };

// ── Inline password-prompt modal ────────────────────────────────────────────
// Re-prompts for the admin password before any destructive / irreversible
// action. The session token is already valid (we wouldn't be on this page
// otherwise) but operations that move/delete tens of thousands of rows
// deserve a typo-proof second step.
const PasswordModal: React.FC<{
  pending: PendingAction;
  busy: boolean;
  errorText: string | null;
  onCancel: () => void;
  onConfirm: (password: string) => void;
}> = ({ pending, busy, errorText, onCancel, onConfirm }) => {
  const [password, setPassword] = useState('');

  const title =
    pending.kind === 'restore-selected' ? 'Restore selected records?' :
    pending.kind === 'restore-all'      ? 'Restore all filtered records?' :
                                          'Permanently purge selected records?';

  const description =
    pending.kind === 'purge-selected'
      ? `${pending.count.toLocaleString()} records will be permanently removed from the archive. This cannot be undone.`
      : `${pending.count.toLocaleString()} records will be moved back into Scraped-Data.`;

  const confirmColor = pending.kind === 'purge-selected'
    ? 'bg-red-600 hover:bg-red-500'
    : 'bg-emerald-600 hover:bg-emerald-500';

  const confirmLabel = pending.kind === 'purge-selected' ? 'Purge permanently' : 'Restore';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onCancel}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4 mb-4">
          <div className={`w-10 h-10 rounded-xl ${pending.kind === 'purge-selected' ? 'bg-red-500/15' : 'bg-emerald-500/15'} flex items-center justify-center shrink-0 mt-0.5`}>
            <svg className={`w-5 h-5 ${pending.kind === 'purge-selected' ? 'text-red-400' : 'text-emerald-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-base font-bold text-white">{title}</h2>
            <p className="text-sm text-slate-400 mt-1 leading-relaxed">{description}</p>
          </div>
        </div>

        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
          Re-enter admin password to confirm
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && password && !busy) onConfirm(password); }}
          autoFocus
          spellCheck={false}
          placeholder="admin password"
          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
        />

        {errorText && (
          <p className="text-xs text-red-400 mt-2">{errorText}</p>
        )}

        <div className="flex gap-3 justify-end mt-5">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(password)}
            disabled={busy || !password}
            className={`px-4 py-2 rounded-lg text-white text-sm font-semibold transition-colors disabled:opacity-50 ${confirmColor}`}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Table ──────────────────────────────────────────────────────────────────

const DeletedTable: React.FC<{
  records: DeletedRecord[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelectAllOnPage: () => void;
  onClearSelection: () => void;
}> = ({ records, selectedIds, onToggle, onSelectAllOnPage, onClearSelection }) => {
  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <svg className="w-12 h-12 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
        <p className="text-sm">No deleted records found</p>
      </div>
    );
  }

  const allPageSelected = records.every((r) => selectedIds.has(r._id));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead>
          <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider">
            <th className="px-4 py-3 w-10">
              <input
                type="checkbox"
                checked={allPageSelected}
                onChange={() => (allPageSelected ? onClearSelection() : onSelectAllOnPage())}
                className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
              />
            </th>
            <th className="px-4 py-3 font-medium">#</th>
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 font-medium">Phone</th>
            <th className="px-4 py-3 font-medium">Address</th>
            <th className="px-4 py-3 font-medium">Category</th>
            <th className="px-4 py-3 font-medium">Pincode</th>
            <th className="px-4 py-3 font-medium">Deleted At</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60">
          {records.map((r, i) => (
            <tr
              key={r._id}
              className={`hover:bg-slate-800/40 transition-colors ${selectedIds.has(r._id) ? 'bg-blue-900/15' : ''}`}
            >
              <td className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={selectedIds.has(r._id)}
                  onChange={() => onToggle(r._id)}
                  className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                />
              </td>
              <td className="px-4 py-3 text-slate-500 text-xs">{i + 1}</td>
              <td className="px-4 py-3">
                <span className="text-slate-200 font-medium line-clamp-1 max-w-[160px] block" title={r.name}>
                  {r.name || <span className="text-slate-600 italic">—</span>}
                </span>
              </td>
              <td className="px-4 py-3">
                {r.phone
                  ? <span className="text-blue-400 font-mono text-xs">{r.phone}</span>
                  : <span className="text-slate-600 italic text-xs">—</span>}
              </td>
              <td className="px-4 py-3 max-w-[200px]">
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
              <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                {r.deletedAt ? new Date(r.deletedAt).toLocaleString() : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ── Main page ──────────────────────────────────────────────────────────────

const DeletedRecordsPage: React.FC = () => {
  const {
    records, total, page, limit, loading, search,
    selectedIds, restoring, purging, lastActionResult,
    fetchRecords, setSearch, setLimit,
    toggleSelect, selectAllOnPage, clearSelection,
    restoreSelected, restoreAllFiltered, purgeSelected, clearResult,
  } = useDeletedRecordsStore();

  const [searchInput, setSearchInput] = useState('');
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    fetchRecords(1);
  }, []);

  const handleSearch = useCallback(() => {
    setSearch(searchInput);
    setTimeout(() => fetchRecords(1), 0);
  }, [searchInput, setSearch, fetchRecords]);

  const handleConfirm = useCallback(async (password: string) => {
    if (!pending) return;
    setAuthError(null);
    const action =
      pending.kind === 'restore-selected' ? restoreSelected(password) :
      pending.kind === 'restore-all'      ? restoreAllFiltered(password) :
                                            purgeSelected(password);
    const result = await action;
    if (result.success) {
      setPending(null);
    } else {
      setAuthError(result.error || 'Action failed');
    }
  }, [pending, restoreSelected, restoreAllFiltered, purgeSelected]);

  const busy = restoring || purging;
  const selectionCount = selectedIds.size;

  return (
    <div className="p-6 space-y-6 min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold text-white leading-tight">Deleted Records</h1>
            <p className="text-xs text-slate-500 mt-0.5">Archive of records removed from Scrap Database — restore or purge with admin password</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setPending({ kind: 'restore-all', count: total })}
            disabled={busy || total === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors shadow-lg shadow-emerald-900/30"
            title={total === 0 ? 'No records to restore' : `Restore all ${total.toLocaleString()} matching records`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Restore All {search ? 'Filtered' : ''}
          </button>
        </div>
      </div>

      {/* Result banner */}
      {lastActionResult && (
        <div className={`flex items-center justify-between border rounded-xl px-5 py-3.5 ${
          lastActionResult.kind === 'restore'
            ? 'bg-emerald-500/10 border-emerald-500/30'
            : 'bg-red-500/10 border-red-500/30'
        }`}>
          <div className="flex items-center gap-3">
            <svg className={`w-5 h-5 shrink-0 ${lastActionResult.kind === 'restore' ? 'text-emerald-400' : 'text-red-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className={`text-sm font-semibold ${lastActionResult.kind === 'restore' ? 'text-emerald-300' : 'text-red-300'}`}>
              {lastActionResult.kind === 'restore'
                ? `Restored ${lastActionResult.count.toLocaleString()} record${lastActionResult.count === 1 ? '' : 's'} back to Scraped-Data.`
                : `Permanently purged ${lastActionResult.count.toLocaleString()} record${lastActionResult.count === 1 ? '' : 's'}.`}
            </p>
          </div>
          <button onClick={clearResult} className="text-slate-500 hover:text-slate-300 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Stat card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
          <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8" />
          </svg>
        </div>
        <div>
          <p className="text-2xl font-bold text-white">{total.toLocaleString()}</p>
          <p className="text-xs text-slate-500 mt-0.5">Records in Scraped-Data-Deleted</p>
        </div>
      </div>

      {/* Selection bar */}
      {selectionCount > 0 && (
        <div className="flex items-center gap-3 bg-blue-900/20 border border-blue-800/40 rounded-lg px-4 py-2.5">
          <span className="text-sm text-blue-300 font-medium">{selectionCount} selected</span>
          <div className="h-4 w-px bg-blue-800/60" />
          <button onClick={selectAllOnPage} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
            Select This Page
          </button>
          <button onClick={clearSelection} className="text-xs text-slate-400 hover:text-white transition-colors">
            Unselect All
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setPending({ kind: 'restore-selected', count: selectionCount })}
              disabled={busy}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Restore Selected
            </button>
            <button
              onClick={() => setPending({ kind: 'purge-selected', count: selectionCount })}
              disabled={busy}
              className="flex items-center gap-1.5 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Purge Forever
            </button>
          </div>
        </div>
      )}

      {/* Search + list */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex-1 flex flex-col min-h-0">
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
              placeholder="Search name, phone, address…"
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
            <Spinner message="Loading deleted records…" />
          </div>
        ) : (
          <>
            <DeletedTable
              records={records}
              selectedIds={selectedIds}
              onToggle={toggleSelect}
              onSelectAllOnPage={selectAllOnPage}
              onClearSelection={clearSelection}
            />
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

      {pending && (
        <PasswordModal
          pending={pending}
          busy={busy}
          errorText={authError}
          onCancel={() => { setPending(null); setAuthError(null); }}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
};

export default DeletedRecordsPage;
