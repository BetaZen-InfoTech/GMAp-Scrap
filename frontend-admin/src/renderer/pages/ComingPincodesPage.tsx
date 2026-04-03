import React, { useEffect } from 'react';
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
  } = useComingPincodeStore();

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

      {/* ── Summary chips (clickable = toggle status filter) ── */}
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
