import React, { useEffect, useState, useCallback } from 'react';
import api from '../lib/api';
import type { ScrapedDataRecord } from '../../shared/types';
import Pagination from '../components/Pagination';
import Spinner from '../components/Spinner';
import { useWebScraperStore } from '../store/useWebScraperStore';

interface WSFilters {
  hasPhone?: boolean;
  missingPhone?: boolean;
  hasAddress?: boolean;
  missingAddress?: boolean;
  hasEmail?: boolean;
  missingEmail?: boolean;
  scrapWebsite?: 'all' | 'scraped' | 'not-scraped';
  search?: string;
}

type TabId = 'queue' | 'results';

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildParams(filters: WSFilters, page: number, limit: number, uniqueWebsite = true): Record<string, string> {
  const p: Record<string, string> = {
    page: String(page),
    limit: String(limit),
    hasWebsite: 'true',
  };
  if (uniqueWebsite) p.uniqueWebsite = 'true';
  if (filters.search) p.search = filters.search;
  if (filters.hasPhone) p.hasPhone = 'true';
  if (filters.missingPhone) p.missingPhone = 'true';
  if (filters.hasAddress) p.hasAddress = 'true';
  if (filters.missingAddress) p.missingAddress = 'true';
  if (filters.hasEmail) p.hasEmail = 'true';
  if (filters.missingEmail) p.missingEmail = 'true';
  if (filters.scrapWebsite === 'scraped') p.scrapWebsite = 'true';
  if (filters.scrapWebsite === 'not-scraped') p.scrapWebsite = 'false';
  return p;
}

// ── Scrape Queue Tab ──────────────────────────────────────────────────────────

const QueueTab: React.FC<{ headless: boolean; uniqueWebsite: boolean; onToggleUnique: () => void }> = ({ headless, uniqueWebsite, onToggleUnique }) => {
  const [records, setRecords] = useState<ScrapedDataRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 25;
  const [loading, setLoading] = useState(false);
  const [filters, setFiltersState] = useState<WSFilters>({ scrapWebsite: 'not-scraped' });
  const [searchInput, setSearchInput] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAllPages, setSelectAllPages] = useState(false);
  const { scraping, setScraping, progress, setProgress, aborted, abort, resetAbort } = useWebScraperStore();

  const fetchRecords = useCallback(async (p = 1, f = filters, uq = uniqueWebsite) => {
    setLoading(true);
    try {
      const res = await api.get('/api/admin/scrap-database', { params: buildParams(f, p, limit, uq) });
      setRecords(res.data.data);
      setTotal(res.data.total);
      setPage(p);
    } catch { setRecords([]); setTotal(0); }
    finally { setLoading(false); }
  }, [filters, uniqueWebsite]);

  useEffect(() => { fetchRecords(1); }, []);

  const applyFilters = (next: WSFilters) => {
    setFiltersState(next);
    setSelectedIds(new Set());
    setSelectAllPages(false);
    fetchRecords(1, next, uniqueWebsite);
  };

  const cycleField = (hasKey: keyof WSFilters, missingKey: keyof WSFilters) => {
    const isHas = !!filters[hasKey];
    const isMissing = !!filters[missingKey];
    const next = { ...filters };
    if (!isHas && !isMissing) { (next as Record<string, unknown>)[hasKey] = true; (next as Record<string, unknown>)[missingKey] = undefined; }
    else if (isHas) { (next as Record<string, unknown>)[hasKey] = undefined; (next as Record<string, unknown>)[missingKey] = true; }
    else { (next as Record<string, unknown>)[hasKey] = undefined; (next as Record<string, unknown>)[missingKey] = undefined; }
    applyFilters(next);
  };

  const cycleScrapWebsite = () => {
    const cur = filters.scrapWebsite;
    const next: WSFilters['scrapWebsite'] = cur === 'not-scraped' ? 'scraped' : cur === 'scraped' ? 'all' : 'not-scraped';
    applyFilters({ ...filters, scrapWebsite: next });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    setSelectAllPages(false);
  };

  const selectPage = () => {
    setSelectedIds((prev) => { const n = new Set(prev); records.forEach((r) => n.add(r._id)); return n; });
    setSelectAllPages(false);
  };

  const clearSelection = () => { setSelectedIds(new Set()); setSelectAllPages(false); };
  const selectionCount = selectAllPages ? total : selectedIds.size;

  const getTargetRecords = async () => {
    if (selectAllPages) {
      const res = await api.get('/api/admin/scrap-database', { params: { ...buildParams(filters, 1, 10000, uniqueWebsite) } });
      return res.data.data as ScrapedDataRecord[];
    }
    return records.filter((r) => selectedIds.has(r._id));
  };

  const startScraping = async () => {
    const targets = await getTargetRecords();
    if (targets.length === 0) return;
    resetAbort();
    setScraping(true);
    setProgress({ total: targets.length, done: 0, newPhones: 0, newEmails: 0, newRecords: 0, errors: 0, log: [] });

    for (let i = 0; i < targets.length; i++) {
      if (useWebScraperStore.getState().aborted) break;
      const record = targets[i];
      const url = record.website;

      if (!url) {
        setProgress((p) => p ? { ...p, done: p.done + 1, log: [`[${i + 1}/${targets.length}] Skipped (no URL): ${record.name}`, ...p.log].slice(0, 100) } : p);
        continue;
      }

      try {
        const result = await window.electronAPI.scrapeWebsite(url, headless);

        const phones = result.success ? result.phones : [];
        const emails = result.success ? (result.emails || []) : [];

        if (phones.length === 0 && emails.length === 0) {
          await api.patch('/api/admin/scrap-database/mark-website-scraped', { ids: [record._id] });
          setProgress((p) => p ? { ...p, done: p.done + 1, log: [`[${i + 1}/${targets.length}] Nothing found: ${record.name}`, ...p.log].slice(0, 100) } : p);
          setRecords((prev) => prev.map((r) => r._id === record._id ? { ...r, scrapWebsite: true } : r));
          continue;
        }

        const existingPhone = (record.phone || '').replace(/[\s-]/g, '');
        const existingEmail = (record.email || '').toLowerCase().trim();
        const newPhones = phones.filter((ph) => ph !== existingPhone && ph.length >= 10);
        const newEmails = emails.filter((em) => em !== existingEmail && em.length > 0);

        const allNewDocs: Record<string, unknown>[] = [];

        // Each new phone → separate record
        for (const ph of newPhones) {
          allNewDocs.push({
            sessionId: record.sessionId, deviceId: record.deviceId,
            name: record.name, nameEnglish: record.nameEnglish, nameLocal: record.nameLocal,
            address: record.address, phone: ph, email: record.email, website: record.website,
            rating: record.rating, reviews: record.reviews, category: record.category,
            pincode: record.pincode, plusCode: record.plusCode, photoUrl: record.photoUrl,
            latitude: record.latitude, longitude: record.longitude, mapsUrl: record.mapsUrl,
            scrapKeyword: record.scrapKeyword, scrapCategory: record.scrapCategory,
            scrapSubCategory: record.scrapSubCategory, scrapRound: record.scrapRound,
          });
        }

        // Each new email → separate record (no phone to avoid duplicate detection)
        for (const em of newEmails) {
          allNewDocs.push({
            sessionId: record.sessionId, deviceId: record.deviceId,
            name: record.name, nameEnglish: record.nameEnglish, nameLocal: record.nameLocal,
            address: record.address, phone: '', email: em, website: record.website,
            rating: record.rating, reviews: record.reviews, category: record.category,
            pincode: record.pincode, plusCode: record.plusCode, photoUrl: record.photoUrl,
            latitude: record.latitude, longitude: record.longitude, mapsUrl: record.mapsUrl,
            scrapKeyword: record.scrapKeyword, scrapCategory: record.scrapCategory,
            scrapSubCategory: record.scrapSubCategory, scrapRound: record.scrapRound,
          });
        }

        const parts: string[] = [];
        if (newPhones.length > 0) parts.push(`+${newPhones.length} phones`);
        if (newEmails.length > 0) parts.push(`+${newEmails.length} emails`);

        if (allNewDocs.length > 0) {
          await api.post('/api/admin/scrap-database/from-website', { sourceId: record._id, records: allNewDocs });
          setProgress((p) => p ? {
            ...p, done: p.done + 1,
            newPhones: p.newPhones + newPhones.length,
            newEmails: p.newEmails + newEmails.length,
            newRecords: p.newRecords + allNewDocs.length,
            log: [`[${i + 1}/${targets.length}] ${parts.join(', ')}: ${record.name}`, ...p.log].slice(0, 100),
          } : p);
        } else {
          await api.patch('/api/admin/scrap-database/mark-website-scraped', { ids: [record._id] });
          setProgress((p) => p ? { ...p, done: p.done + 1, log: [`[${i + 1}/${targets.length}] Same data: ${record.name}`, ...p.log].slice(0, 100) } : p);
        }
        setRecords((prev) => prev.map((r) => r._id === record._id ? { ...r, scrapWebsite: true } : r));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setProgress((p) => p ? { ...p, done: p.done + 1, errors: p.errors + 1, log: [`[${i + 1}/${targets.length}] Error (${record.name}): ${msg}`, ...p.log].slice(0, 100) } : p);
      }

      await new Promise((r) => setTimeout(r, 500));
    }

    setScraping(false);
    // Auto-refresh list after scraping to remove scraped URLs
    fetchRecords(1);
  };

  const fieldBtn = (label: string, hk: keyof WSFilters, mk: keyof WSFilters) => {
    const isHas = !!filters[hk]; const isMissing = !!filters[mk];
    let cls = 'bg-slate-800 text-slate-400 border border-slate-700'; let text = label;
    if (isHas) { cls = 'bg-green-900/50 text-green-300 ring-1 ring-green-700/60'; text = `Has ${label}`; }
    if (isMissing) { cls = 'bg-red-900/50 text-red-300 ring-1 ring-red-700/60'; text = `No ${label}`; }
    return <button key={label} onClick={() => cycleField(hk, mk)} className={`text-xs font-medium px-2.5 py-1 rounded-md transition-all ${cls}`}>{text}</button>;
  };

  const scrapWsCls = filters.scrapWebsite === 'scraped' ? 'bg-emerald-900/50 text-emerald-300 ring-1 ring-emerald-700/60'
    : filters.scrapWebsite === 'all' ? 'bg-slate-800 text-slate-400 border border-slate-700'
    : 'bg-orange-900/50 text-orange-300 ring-1 ring-orange-700/60';
  const scrapWsLabel = filters.scrapWebsite === 'scraped' ? 'Web Scraped' : filters.scrapWebsite === 'all' ? 'All Status' : 'Not Web Scraped';

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input type="text" value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') applyFilters({ ...filters, search: searchInput }); }}
          placeholder="Search name, address..."
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 w-52"
        />
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2">
          {fieldBtn('Phone', 'hasPhone', 'missingPhone')}
          {fieldBtn('Address', 'hasAddress', 'missingAddress')}
          {fieldBtn('Email', 'hasEmail', 'missingEmail')}
        </div>
        <button onClick={cycleScrapWebsite} className={`text-xs font-medium px-2.5 py-1.5 rounded-lg transition-all ${scrapWsCls}`}>
          {scrapWsLabel}
        </button>
        {/* Unique website toggle */}
        <button
          onClick={() => { onToggleUnique(); setTimeout(() => fetchRecords(1, filters, !uniqueWebsite), 0); }}
          className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-all ${
            uniqueWebsite
              ? 'bg-blue-900/50 text-blue-300 ring-1 ring-blue-700/60'
              : 'bg-slate-800 text-slate-400 border border-slate-700'
          }`}
          title={uniqueWebsite ? 'Showing unique websites only (one per URL)' : 'Showing all records (may have duplicate URLs)'}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          {uniqueWebsite ? 'Unique URLs' : 'All URLs'}
        </button>
        <button onClick={() => { applyFilters({ scrapWebsite: 'not-scraped' }); setSearchInput(''); }}
          className="text-slate-400 hover:text-white text-sm transition-colors">Clear</button>
      </div>

      {/* Selection bar */}
      {selectionCount > 0 && (
        <div className="flex items-center gap-3 bg-blue-900/20 border border-blue-800/40 rounded-lg px-4 py-2.5">
          <span className="text-sm text-blue-300 font-medium">
            {selectAllPages ? `All ${total.toLocaleString()} records` : `${selectionCount} selected`}
          </span>
          <div className="h-4 w-px bg-blue-800/60" />
          <button onClick={selectPage} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">Select This Page</button>
          <button onClick={() => setSelectAllPages(true)} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
            Select All ({total.toLocaleString()})
          </button>
          <button onClick={clearSelection} className="text-xs text-slate-400 hover:text-white transition-colors">Unselect All</button>
          <div className="ml-auto">
            {!scraping ? (
              <button onClick={startScraping}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-4 py-1.5 rounded-lg transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" />
                </svg>
                Start Scraping ({selectionCount})
                {headless && <span className="ml-1 text-[10px] opacity-70">[Browser]</span>}
              </button>
            ) : (
              <button onClick={() => abort()}
                className="bg-red-700 hover:bg-red-600 text-white text-xs font-medium px-4 py-1.5 rounded-lg transition-colors">Stop</button>
            )}
          </div>
        </div>
      )}

      {/* Progress */}
      {progress && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-white">
              {scraping ? 'Scraping...' : 'Done'}{' '}
              <span className="text-slate-400 font-normal">{progress.done}/{progress.total}</span>
            </span>
            <div className="flex gap-4 text-xs">
              <span className="text-emerald-400">+{progress.newRecords} records</span>
              <span className="text-blue-400">{progress.newPhones} phones</span>
              <span className="text-purple-400">{progress.newEmails} emails</span>
              {progress.errors > 0 && <span className="text-red-400">{progress.errors} errors</span>}
            </div>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${scraping ? 'bg-blue-500' : 'bg-emerald-500'}`}
              style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }} />
          </div>
          {progress.log.length > 0 && (
            <div className="max-h-24 overflow-y-auto space-y-0.5">
              {progress.log.map((line, i) => <p key={i} className="text-xs text-slate-500 font-mono">{line}</p>)}
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col" style={{ minHeight: '400px' }}>
        {loading && records.length === 0 ? (
          <div className="p-8 flex justify-center"><Spinner message="Loading..." /></div>
        ) : records.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">No records found</div>
        ) : (
          <>
            <div className="overflow-x-auto overflow-y-auto flex-1">
              <table className="w-full text-xs min-w-[900px]">
                <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 z-10">
                  <tr>
                    <th className="w-8 px-3 py-3">
                      <input type="checkbox" className="accent-blue-500"
                        checked={records.length > 0 && records.every((r) => selectedIds.has(r._id))}
                        onChange={() => {
                          if (records.every((r) => selectedIds.has(r._id))) {
                            setSelectedIds((prev) => { const n = new Set(prev); records.forEach((r) => n.delete(r._id)); return n; });
                          } else selectPage();
                        }}
                      />
                    </th>
                    {['Name', 'Phone', 'Website', 'Category', 'Pincode', 'Status'].map((h) => (
                      <th key={h} className="px-3 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {records.map((r) => (
                    <tr key={r._id} className={`transition-colors ${selectedIds.has(r._id) ? 'bg-blue-900/10' : 'hover:bg-slate-800/40'}`}>
                      <td className="px-3 py-2.5">
                        <input type="checkbox" className="accent-blue-500" checked={selectedIds.has(r._id)} onChange={() => toggleSelect(r._id)} />
                      </td>
                      <td className="px-3 py-2.5 text-white font-medium max-w-[160px] truncate" title={r.name}>{r.name || '—'}</td>
                      <td className="px-3 py-2.5 text-slate-300 font-mono">{r.phone || <span className="text-slate-600">—</span>}</td>
                      <td className="px-3 py-2.5 max-w-[200px]">
                        {r.website ? <span className="text-blue-400 truncate block" title={r.website}>{r.website.replace(/^https?:\/\//, '').slice(0, 35)}</span>
                          : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        {r.category ? <span className="bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded text-[10px]">{r.category}</span>
                          : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-slate-400 font-mono">{r.pincode || '—'}</td>
                      <td className="px-3 py-2.5">
                        {r.scrapWebsite
                          ? <span className="flex items-center gap-1 text-emerald-400 text-[11px]">
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                              Scraped
                            </span>
                          : <span className="text-slate-600 text-[10px]">Pending</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-slate-800 px-4 py-2 shrink-0">
              <Pagination page={page} total={total} limit={limit} onPageChange={(p) => fetchRecords(p)} />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ── Results Tab (scrapFrom = 'website') ───────────────────────────────────────

const ResultsTab: React.FC = () => {
  const [records, setRecords] = useState<ScrapedDataRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const limit = 25;

  const fetchResults = useCallback(async (p = 1, s = search) => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(p), limit: String(limit), scrapFrom: 'website' };
      if (s) params.search = s;
      const res = await api.get('/api/admin/scrap-database', { params });
      setRecords(res.data.data);
      setTotal(res.data.total);
      setPage(p);
    } catch { setRecords([]); setTotal(0); }
    finally { setLoading(false); }
  }, [search]);

  useEffect(() => { fetchResults(1); }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') fetchResults(1, search); }}
          placeholder="Search name, address..."
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 w-52"
        />
        <button onClick={() => fetchResults(1, search)}
          className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors">Search</button>
        <button onClick={() => { setSearch(''); fetchResults(1, ''); }}
          className="text-slate-400 hover:text-white text-sm transition-colors">Clear</button>
        <button onClick={() => fetchResults(page, search)}
          className="ml-auto flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium px-3 py-2 rounded-lg transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col" style={{ minHeight: '400px' }}>
        {loading && records.length === 0 ? (
          <div className="p-8 flex justify-center"><Spinner message="Loading..." /></div>
        ) : records.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">No website-scraped records yet</div>
        ) : (
          <>
            <div className="overflow-x-auto overflow-y-auto flex-1">
              <table className="w-full text-xs min-w-[900px]">
                <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 z-10">
                  <tr>
                    {['Name', 'Phone', 'Email', 'Website', 'Address', 'Category', 'Pincode', 'Rating'].map((h) => (
                      <th key={h} className="px-3 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {records.map((r) => (
                    <tr key={r._id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-3 py-2.5 text-white font-medium max-w-[160px] truncate" title={r.name}>{r.name || '—'}</td>
                      <td className="px-3 py-2.5 text-emerald-400 font-mono font-semibold">{r.phone || <span className="text-slate-600">—</span>}</td>
                      <td className="px-3 py-2.5 text-slate-400">{r.email || <span className="text-slate-600">—</span>}</td>
                      <td className="px-3 py-2.5 max-w-[160px]">
                        {r.website ? <span className="text-blue-400 truncate block" title={r.website}>{r.website.replace(/^https?:\/\//, '').slice(0, 30)}</span>
                          : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-slate-400 max-w-[180px] truncate" title={r.address}>{r.address || '—'}</td>
                      <td className="px-3 py-2.5">
                        {r.category ? <span className="bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded text-[10px]">{r.category}</span>
                          : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-slate-400 font-mono">{r.pincode || '—'}</td>
                      <td className="px-3 py-2.5 text-yellow-400">{r.rating ? `★ ${r.rating}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-slate-800 px-4 py-2 shrink-0">
              <Pagination page={page} total={total} limit={limit} onPageChange={(p) => fetchResults(p)} />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────

const WebsiteScraperPage: React.FC = () => {
  const [tab, setTab] = useState<TabId>('queue');
  const [headless, setHeadless] = useState(false);
  const [uniqueWebsite, setUniqueWebsite] = useState(true);

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Website Scraper</h2>
          <p className="text-sm text-slate-500 mt-0.5">Scrape phone numbers from business websites</p>
        </div>
        {/* Headless toggle */}
        <button
          onClick={() => setHeadless((h) => !h)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
            headless
              ? 'bg-purple-900/40 border-purple-700/60 text-purple-300'
              : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
          }`}
          title={headless ? 'Headless Browser mode: renders JavaScript (slower, more accurate)' : 'Simple Fetch mode: fast HTTP request (no JS rendering)'}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          {headless ? 'Headless Browser (JS)' : 'Simple Fetch (HTML)'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1 self-start">
        {([
          { id: 'queue', label: 'Scrape Queue' },
          { id: 'results', label: 'Scraped from Website' },
        ] as { id: TabId; label: string }[]).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
              tab === id ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === 'queue'
          ? <QueueTab headless={headless} uniqueWebsite={uniqueWebsite} onToggleUnique={() => setUniqueWebsite((u) => !u)} />
          : <ResultsTab />}
      </div>
    </div>
  );
};

export default WebsiteScraperPage;
