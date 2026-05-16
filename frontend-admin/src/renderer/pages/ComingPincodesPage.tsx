import React, { useEffect, useMemo } from 'react';
import { useComingPincodeStore, PincodeRowStatus } from '../store/useComingPincodeStore';
import Pagination from '../components/Pagination';
import Spinner from '../components/Spinner';

// ─── Status helpers ───────────────────────────────────────────────────────────
const STATUS_LABELS: Record<PincodeRowStatus, string> = {
  running:   'Running',
  completed: 'Completed',
  stop:      'Stop',
  pending:   'Pending',
};

const STATUS_BADGE: Record<PincodeRowStatus, string> = {
  running:   'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  completed: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
  stop:      'bg-red-500/20 text-red-400 border border-red-500/30',
  pending:   'bg-slate-700/60 text-slate-400 border border-slate-600/30',
};

const STATUS_DOT: Record<PincodeRowStatus, string> = {
  running:   'bg-blue-400 animate-pulse',
  completed: 'bg-emerald-400',
  stop:      'bg-red-400',
  pending:   'bg-slate-500',
};

function statusBadge(status: PincodeRowStatus) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[status]}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[status]}`} />
      {STATUS_LABELS[status]}
    </span>
  );
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ─── Stat chip ───────────────────────────────────────────────────────────────
interface StatChipProps {
  label: string;
  count: number;
  dotClass: string;
  borderClass: string;
  active: boolean;
  onClick: () => void;
}
const StatChip: React.FC<StatChipProps> = ({ label, count, dotClass, borderClass, active, onClick }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 border rounded-lg px-3 py-2 transition-all ${
      active
        ? `${borderClass} bg-slate-800`
        : 'border-slate-800 bg-slate-900 hover:bg-slate-800/60'
    }`}
  >
    <span className={`w-2 h-2 rounded-full ${dotClass}`} />
    <span className="text-xs text-slate-300 font-medium">{count.toLocaleString()} {label}</span>
    {active && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />}
  </button>
);

// ─── Main Page ────────────────────────────────────────────────────────────────
const ComingPincodesPage: React.FC = () => {
  const {
    pincodes, total, page, limit, loading, error, counts, filters,
    states, districts,
    fetchPincodes, fetchStates, fetchDistricts,
    setLimit, setFilters, clearFilters,
    downloadSampleExcel,
  } = useComingPincodeStore();

  const [downloading, setDownloading] = React.useState(false);
  const [downloadMenuOpen, setDownloadMenuOpen] = React.useState(false);
  const downloadMenuRef = React.useRef<HTMLDivElement | null>(null);

  // Close the dropdown when the operator clicks anywhere else on the page.
  // Without this the menu sticks open until the next download fires, which
  // is jarring when you cancel out of the choice.
  useEffect(() => {
    if (!downloadMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(e.target as Node)) {
        setDownloadMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [downloadMenuOpen]);

  const runDownload = async (label: string, statusOverride?: PincodeRowStatus[]) => {
    if (downloading) return;
    setDownloadMenuOpen(false);
    setDownloading(true);
    try {
      const result = await downloadSampleExcel(limit, statusOverride);
      alert(
        `Downloaded ${result.samples.toLocaleString()} ${label} pincode(s) — one every ${limit} ` +
        `from ${result.sourceCount.toLocaleString()} matching pincodes.`
      );
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      const msg = e?.response?.data?.error || e?.message || 'Download failed';
      alert(`Download failed: ${msg}`);
    } finally {
      setDownloading(false);
    }
  };

  // Main-button click — honor the current page filter (existing behavior).
  const handleDownload = () => runDownload('filtered');

  // Dropdown shortcuts — explicit status override (bypasses page filter).
  // Each entry is name + the statuses array passed to downloadSampleExcel.
  // Empty array = all statuses (no status filter).
  const DOWNLOAD_OPTIONS: { key: string; label: string; statuses: PincodeRowStatus[]; dot: string }[] = [
    { key: 'all',       label: 'All Status', statuses: [], dot: 'bg-slate-400' },
    { key: 'running',   label: 'Running',    statuses: ['running'],   dot: 'bg-blue-400' },
    { key: 'completed', label: 'Completed',  statuses: ['completed'], dot: 'bg-emerald-400' },
    { key: 'stop',      label: 'Stop',       statuses: ['stop'],      dot: 'bg-red-400' },
    { key: 'pending',   label: 'Pending',    statuses: ['pending'],   dot: 'bg-slate-500' },
  ];

  // ── Per-page download ────────────────────────────────────────────────────
  // Builds an Excel from the records ALREADY on this page (no extra fetch).
  // The "Download Excel (every N)" flow samples 1-per-N across the whole
  // filtered set; this is the dual — "give me the 100 rows I'm staring at."
  const downloadCurrentPage = async (statusOverride?: PincodeRowStatus[]) => {
    if (downloading) return;
    setDownloadMenuOpen(false);
    setDownloading(true);
    try {
      const filtered = (statusOverride && statusOverride.length > 0)
        ? pincodes.filter((p) => statusOverride.includes(p.status))
        : pincodes;
      if (filtered.length === 0) {
        throw new Error(
          statusOverride?.length
            ? `No ${statusOverride.join('/')} pincodes on this page.`
            : 'This page has no records.'
        );
      }

      const XLSX = await import('xlsx');
      const scope = !statusOverride?.length
        ? 'All'
        : statusOverride.length === 1
          ? statusOverride[0].charAt(0).toUpperCase() + statusOverride[0].slice(1)
          : `${statusOverride.length} statuses`;

      // Build with array-of-arrays so we can prepend the same summary block
      // the sampled-download flow uses. Each status gets its own row so the
      // counts read as a stat table rather than a wrapped sentence. Layout:
      //   r0: title banner
      //   r1: page-coordinate / showing line
      //   r2: "Running"   | count
      //   r3: "Completed" | count
      //   r4: "Stop"      | count
      //   r5: "Pending"   | count
      //   r6: filters line
      //   r7: blank spacer
      //   r8: column headers
      //   r9+: data
      const filterParts: string[] = [];
      if (filters.state)    filterParts.push(`State: ${filters.state}`);
      if (filters.district) filterParts.push(`District: ${filters.district}`);
      filterParts.push(`Status: ${scope}`);

      const title = `Coming Pincodes — Page ${page} (${pageStart.toLocaleString()}–${pageEnd.toLocaleString()} of ${total.toLocaleString()})`;
      const showingLine = `THIS PAGE   ·   Showing ${filtered.length.toLocaleString()} of ${pincodes.length.toLocaleString()}`;
      const filterLine = `Filters — ${filterParts.join('   ·   ')}`;
      const headerCols = [
        '#', 'Pincode', 'District', 'State', 'Status',
        'Completed Rounds', 'Completed Searches', 'Total Niches',
        'Last Activity', 'Last Run At', 'Updated At',
      ];
      const dataRows = filtered.map((p, i) => [
        (page - 1) * limit + i + 1,
        p.pincode,
        p.district || '',
        p.stateName || '',
        p.status,
        (p.completedRounds || []).join(','),
        p.completedSearches,
        p.totalNiches,
        p.lastActivity || '',
        p.lastRunAt || '',
        p.updatedAt || '',
      ]);
      const aoa: (string | number)[][] = [
        [title],
        [showingLine],
        ['Running',   pageCounts.running],
        ['Completed', pageCounts.completed],
        ['Stop',      pageCounts.stop],
        ['Pending',   pageCounts.pending],
        [filterLine],
        [],
        headerCols,
        ...dataRows,
      ];
      const dataStartRow = 9;

      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [
        { wch: 8 }, { wch: 10 }, { wch: 22 }, { wch: 18 }, { wch: 12 },
        { wch: 18 }, { wch: 18 }, { wch: 12 },
        { wch: 24 }, { wch: 24 }, { wch: 24 },
      ];
      // Merge wide banner rows; leave the four status rows as (label | count).
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: headerCols.length - 1 } }, // title
        { s: { r: 1, c: 0 }, e: { r: 1, c: headerCols.length - 1 } }, // showing
        { s: { r: 6, c: 0 }, e: { r: 6, c: headerCols.length - 1 } }, // filters
      ];
      ws['!freeze'] = { xSplit: 0, ySplit: dataStartRow };

      const wb = XLSX.utils.book_new();
      const sheetName = `Page ${page} ${scope} (${filtered.length})`.slice(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const fileScope = statusOverride?.length === 1 ? `-${statusOverride[0]}` : statusOverride?.length === 0 ? '-all' : '';
      XLSX.writeFile(wb, `coming-pincodes-page${page}${fileScope}-${ts}.xlsx`);

      alert(`Downloaded ${filtered.length.toLocaleString()} pincode(s) from this page (${scope}).`);
    } catch (err: unknown) {
      const e = err as { message?: string };
      alert(`Download failed: ${e?.message || 'Unknown error'}`);
    } finally {
      setDownloading(false);
    }
  };

  // Load states and all pincodes on mount
  useEffect(() => {
    fetchStates();
    fetchPincodes(1, '', '', []);
  }, []);

  // When state filter changes, reload districts and reset district filter
  const handleStateChange = (state: string) => {
    setFilters({ state, district: '' });
    if (state) {
      fetchDistricts(state);
    }
    fetchPincodes(1, state, '', filters.statuses);
  };

  const handleDistrictChange = (district: string) => {
    setFilters({ district });
    fetchPincodes(1, filters.state, district, filters.statuses);
  };

  // Toggle a status in the multi-select
  const toggleStatus = (s: PincodeRowStatus) => {
    const current = filters.statuses;
    const next = current.includes(s)
      ? current.filter(x => x !== s)
      : [...current, s];
    setFilters({ statuses: next });
    fetchPincodes(1, filters.state, filters.district, next);
  };

  const handleClear = () => {
    clearFilters();
    fetchPincodes(1, '', '', []);
  };

  const hasFilters = filters.state || filters.district || filters.statuses.length > 0;

  // Per-page stats — counted from the records currently visible on screen.
  // `counts` (above) is the global total across the whole filtered set;
  // operators also want to know what's on THIS page so they don't have to
  // count manually. Recomputed only when the visible rows change.
  const pageCounts = useMemo(() => {
    const buckets = { running: 0, completed: 0, stop: 0, pending: 0 } as Record<PincodeRowStatus, number>;
    for (const p of pincodes) {
      if (p.status in buckets) buckets[p.status]++;
    }
    return buckets;
  }, [pincodes]);

  // Position of the current page in the filtered set, for the "Showing 2701-2800" line
  const pageStart = pincodes.length === 0 ? 0 : (page - 1) * limit + 1;
  const pageEnd   = pageStart === 0 ? 0 : pageStart + pincodes.length - 1;

  const CHIPS: { key: PincodeRowStatus; label: string; dot: string; border: string }[] = [
    { key: 'running',   label: 'Running',   dot: 'bg-blue-400 animate-pulse', border: 'border-blue-800/60'    },
    { key: 'completed', label: 'Completed', dot: 'bg-emerald-400',            border: 'border-emerald-800/60' },
    { key: 'stop',      label: 'Stop',      dot: 'bg-red-400',                border: 'border-red-800/60'     },
    { key: 'pending',   label: 'Pending',   dot: 'bg-slate-500',              border: 'border-slate-600/60'   },
  ];

  return (
    <div className="flex flex-col gap-5 h-full min-h-0">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Coming Pincodes</h2>
          <p className="text-sm text-slate-500 mt-0.5">{total.toLocaleString()} pincodes</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Split-button: main click downloads with current filter; caret
              opens a menu of explicit status shortcuts. */}
          <div ref={downloadMenuRef} className="relative inline-flex">
            <button
              onClick={handleDownload}
              disabled={downloading || loading || total === 0}
              title={`Sample one pincode every ${limit} using the current page filter. Use the caret for status-specific downloads.`}
              className="flex items-center gap-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-green-50 text-sm font-medium pl-3 pr-2.5 py-2 rounded-l-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {downloading ? 'Downloading…' : `Download Excel (every ${limit})`}
            </button>
            <button
              onClick={() => setDownloadMenuOpen((v) => !v)}
              disabled={downloading || loading}
              title="Pick a status to download"
              aria-label="Download status options"
              aria-expanded={downloadMenuOpen}
              className="flex items-center justify-center bg-green-700 hover:bg-green-600 disabled:opacity-50 text-green-50 px-2 py-2 rounded-r-lg border-l border-green-800/60 transition-colors"
            >
              <svg className={`w-3.5 h-3.5 transition-transform ${downloadMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {downloadMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 z-30 w-64 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl overflow-hidden">
                {/* ── Section A: sampled-across-all (1 per `limit`) ── */}
                <div className="px-3 py-2 border-b border-slate-800">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Sampled — every {limit}</p>
                  <p className="text-[10px] text-slate-600 mt-0.5">Across the entire filtered set (bypasses status filter).</p>
                </div>
                {DOWNLOAD_OPTIONS.map((opt) => {
                  const count = opt.key === 'all'
                    ? counts.running + counts.completed + counts.stop + counts.pending
                    : counts[opt.key as PincodeRowStatus] || 0;
                  return (
                    <button
                      key={`s-${opt.key}`}
                      onClick={() => runDownload(opt.label, opt.statuses)}
                      disabled={downloading || count === 0}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 ${opt.dot}`} />
                      <span className="flex-1">{opt.label}</span>
                      <span className="text-[10px] text-slate-500 font-mono tabular-nums">
                        {count.toLocaleString()}
                      </span>
                    </button>
                  );
                })}

                {/* ── Section B: this-page only (no extra fetch) ── */}
                <div className="px-3 py-2 border-b border-t border-slate-800 mt-0.5">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                    This page · {pageStart.toLocaleString()}–{pageEnd.toLocaleString()}
                  </p>
                  <p className="text-[10px] text-slate-600 mt-0.5">Records visible on screen right now.</p>
                </div>
                {DOWNLOAD_OPTIONS.map((opt) => {
                  const count = opt.key === 'all'
                    ? pincodes.length
                    : pageCounts[opt.key as PincodeRowStatus] || 0;
                  return (
                    <button
                      key={`p-${opt.key}`}
                      onClick={() => downloadCurrentPage(opt.statuses)}
                      disabled={downloading || count === 0}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 ${opt.dot}`} />
                      <span className="flex-1">{opt.label}</span>
                      <span className="text-[10px] text-slate-500 font-mono tabular-nums">
                        {count.toLocaleString()}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button
            onClick={() => fetchPincodes(page, filters.state, filters.district, filters.statuses)}
            disabled={loading}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 text-sm font-medium px-3 py-2 rounded-lg transition-colors"
          >
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* ── Summary chips — GLOBAL across the filtered set (clickable = toggle status filter) ── */}
      <div className="flex flex-wrap gap-3">
        {CHIPS.map(({ key, label, dot, border }) => (
          <StatChip
            key={key}
            label={label}
            count={counts[key]}
            dotClass={dot}
            borderClass={border}
            active={filters.statuses.includes(key)}
            onClick={() => toggleStatus(key)}
          />
        ))}
      </div>

      {/* ── Per-page stats — what's actually on screen right now ── */}
      {pincodes.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 -mt-1 text-xs text-slate-400">
          <span className="font-medium text-slate-500 uppercase tracking-wider">
            This page · {pageStart.toLocaleString()}–{pageEnd.toLocaleString()} of {total.toLocaleString()}
          </span>
          {CHIPS.map(({ key, label, dot }) => (
            <span key={key} className="inline-flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
              <span className="tabular-nums text-slate-300 font-semibold">{pageCounts[key].toLocaleString()}</span>
              <span>{label}</span>
            </span>
          ))}
        </div>
      )}

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-3">

        {/* State */}
        <select
          value={filters.state}
          onChange={e => handleStateChange(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 min-w-[160px]"
        >
          <option value="">All States</option>
          {states.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {/* District (only shown when state is selected) */}
        {filters.state && (
          <select
            value={filters.district}
            onChange={e => handleDistrictChange(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 min-w-[160px]"
          >
            <option value="">All Districts</option>
            {districts.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        )}

        {/* Status multi-checkboxes */}
        <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2">
          {CHIPS.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={filters.statuses.includes(key)}
                onChange={() => toggleStatus(key)}
                className="w-3.5 h-3.5 rounded accent-blue-500"
              />
              <span className="text-xs text-slate-300">{label}</span>
            </label>
          ))}
        </div>

        {/* Clear */}
        {hasFilters && (
          <button
            onClick={handleClear}
            className="text-slate-400 hover:text-white text-sm transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* ── Table ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex-1 flex flex-col min-h-0">
        {loading && pincodes.length === 0 ? (
          <div className="p-8 flex justify-center">
            <Spinner message="Loading pincodes..." />
          </div>
        ) : pincodes.length === 0 ? (
          <div className="p-12 flex flex-col items-center gap-3 text-center">
            <p className="text-slate-500 text-sm">No pincodes match the selected filters.</p>
          </div>
        ) : (
          <>
            <div className="overflow-auto flex-1">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-900 z-10">
                  <tr className="border-b border-slate-800">
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider w-12">#</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Pincode</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">District</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">State</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Niches Done</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Last Activity</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">First Seen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {pincodes.map((p, idx) => (
                    <tr key={p.pincode} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 text-center text-xs text-slate-500 font-mono">{(page - 1) * limit + idx + 1}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-sm font-semibold text-white">{p.pincode}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-300">{p.district || '—'}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{p.stateName || '—'}</td>
                      <td className="px-4 py-3 text-center">{statusBadge(p.status)}</td>
                      <td className="px-4 py-3 text-center">
                        {p.status === 'pending' ? (
                          <span className="text-xs text-slate-600">—</span>
                        ) : (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-xs font-semibold text-slate-200">
                              {p.completedSearches}
                              {p.totalNiches > 0 && <span className="text-slate-500 font-normal">/{p.totalNiches * 3}</span>}
                            </span>
                            {p.completedRounds.length > 0 && (
                              <span className="text-[10px] text-slate-500">
                                R{p.completedRounds.join(',')} done
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-xs text-slate-400" title={p.lastActivity ? formatDate(p.lastActivity) : undefined}>
                          {timeAgo(p.lastActivity)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-xs text-slate-500">
                          {p.lastRunAt ? formatDate(p.lastRunAt) : '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-slate-800 px-4 py-2">
              <Pagination
                page={page} total={total} limit={limit}
                onPageChange={p => fetchPincodes(p, filters.state, filters.district, filters.statuses)}
                onLimitChange={(l) => { setLimit(l); setTimeout(() => fetchPincodes(1, filters.state, filters.district, filters.statuses), 0); }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ComingPincodesPage;
