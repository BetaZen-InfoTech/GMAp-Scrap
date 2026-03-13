import React, { useEffect, useState, useMemo } from 'react';
import type { SessionState, ScrapedRecord } from '../types';

interface SessionDataModalProps {
  sessionId: string | null;
  onClose: () => void;
}

const COLS = [
  { key: 'name', label: 'Name', width: 'min-w-[160px]' },
  { key: 'nameEnglish', label: 'Name (EN)', width: 'min-w-[140px]' },
  { key: 'nameLocal', label: 'Name (Local)', width: 'min-w-[140px]' },
  { key: 'address', label: 'Address', width: 'min-w-[200px]' },
  { key: 'phone', label: 'Phone', width: 'min-w-[120px]' },
  { key: 'email', label: 'Email', width: 'min-w-[160px]' },
  { key: 'website', label: 'Website', width: 'min-w-[150px]' },
  { key: 'rating', label: 'Rating', width: 'min-w-[70px]' },
  { key: 'reviews', label: 'Reviews', width: 'min-w-[75px]' },
  { key: 'category', label: 'Type', width: 'min-w-[120px]' },
  { key: 'plusCode', label: 'Plus Code', width: 'min-w-[120px]' },
  { key: 'latitude', label: 'Lat', width: 'min-w-[90px]' },
  { key: 'longitude', label: 'Lng', width: 'min-w-[90px]' },
  { key: 'photoUrl', label: 'Photo', width: 'min-w-[65px]' },
  { key: 'mapsUrl', label: 'Maps', width: 'min-w-[65px]' },
] as const;

const PAGE_SIZE = 50;

const SessionDataModal: React.FC<SessionDataModalProps> = ({ sessionId, onClose }) => {
  const [session, setSession] = useState<SessionState | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!sessionId) return;
    setLoading(true);
    setSearch('');
    setPage(1);
    window.electronAPI.getSession(sessionId).then((s) => {
      setSession(s ?? null);
      setLoading(false);
    });
  }, [sessionId]);

  // Live updates for running sessions
  useEffect(() => {
    if (!sessionId) return;
    const off = window.electronAPI.onProgress((payload) => {
      if (payload.sessionId !== sessionId) return;
      if (payload.record) {
        setSession((prev) => prev ? {
          ...prev,
          totalScraped: payload.totalScraped,
          status: payload.status,
          records: [...prev.records, payload.record!],
        } : prev);
      }
    });
    return off;
  }, [sessionId]);

  const filtered = useMemo(() => {
    if (!session) return [];
    const q = search.toLowerCase();
    if (!q) return session.records;
    return session.records.filter((r) =>
      r.name.toLowerCase().includes(q) ||
      (r.nameEnglish ?? '').toLowerCase().includes(q) ||
      (r.nameLocal ?? '').toLowerCase().includes(q) ||
      r.address.toLowerCase().includes(q) ||
      r.phone.includes(q) ||
      (r.email ?? '').toLowerCase().includes(q) ||
      r.category.toLowerCase().includes(q) ||
      r.website.toLowerCase().includes(q) ||
      (r.plusCode ?? '').toLowerCase().includes(q)
    );
  }, [session, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRecords = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (!sessionId) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-7xl mx-4 flex flex-col shadow-2xl"
           style={{ height: '90vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 flex-shrink-0">
          <div className="flex items-center gap-4">
            <div>
              <h2 className="text-lg font-bold text-white">
                {session?.keyword ?? '—'}
              </h2>
              <div className="text-xs text-slate-500 font-mono">{sessionId}</div>
            </div>
            {session && (
              <div className="flex items-center gap-3 text-sm">
                <span className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1 text-blue-400 font-semibold">
                  {filtered.length.toLocaleString()} records
                  {search && ` (filtered from ${session.records.length})`}
                </span>
                <span className={`text-xs px-2 py-1 rounded-full font-medium text-white ${
                  session.status === 'running' ? 'bg-green-600' :
                  session.status === 'completed' ? 'bg-blue-600' :
                  session.status === 'error' ? 'bg-red-600' : 'bg-slate-600'
                }`}>
                  {session.status.toUpperCase()}
                  {session.status === 'running' && <span className="ml-1 animate-pulse">●</span>}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search name, address, phone…"
              autoComplete="off"
              className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500 w-56"
            />
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg px-3 py-2 text-sm transition-colors"
            >
              Close
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-full text-slate-400 text-sm">
              Loading…
            </div>
          ) : pageRecords.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
              <div className="text-3xl mb-2">📋</div>
              <p className="text-sm">{search ? 'No records match your search.' : 'No records scraped yet.'}</p>
            </div>
          ) : (
            <table className="w-full text-xs min-w-max">
              <thead className="sticky top-0 bg-slate-800 border-b border-slate-700 z-10">
                <tr>
                  <th className="text-left px-3 py-3 text-slate-400 font-semibold w-10">#</th>
                  {COLS.map((col) => (
                    <th key={col.key} className={`text-left px-3 py-3 text-slate-400 font-semibold ${col.width}`}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRecords.map((record, i) => (
                  <RecordRow key={`${record.mapsUrl}-${i}`} record={record} index={(page - 1) * PAGE_SIZE + i + 1} />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination footer */}
        {filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-slate-700 flex-shrink-0 bg-slate-900/80">
            <span className="text-xs text-slate-400">
              Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(1)}
                disabled={page === 1}
                className="px-2 py-1 text-xs rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >«</button>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-2 py-1 text-xs rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >‹</button>
              {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                const pg = totalPages <= 7 ? i + 1 : Math.max(1, Math.min(page - 3, totalPages - 6)) + i;
                return (
                  <button
                    key={pg}
                    onClick={() => setPage(pg)}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      pg === page ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >{pg}</button>
                );
              })}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-2 py-1 text-xs rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >›</button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={page === totalPages}
                className="px-2 py-1 text-xs rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >»</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const RecordRow: React.FC<{ record: ScrapedRecord; index: number }> = ({ record, index }) => (
  <tr className="border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors">
    <td className="px-3 py-2 text-slate-500">{index}</td>
    <td className="px-3 py-2 text-white font-medium max-w-[180px] truncate" title={record.name}>
      {record.name}
    </td>
    <td className="px-3 py-2 text-slate-300 max-w-[150px] truncate" title={record.nameEnglish}>
      {record.nameEnglish || '—'}
    </td>
    <td className="px-3 py-2 text-slate-300 max-w-[150px] truncate" title={record.nameLocal}>
      {record.nameLocal || '—'}
    </td>
    <td className="px-3 py-2 text-slate-300 max-w-[220px] truncate" title={record.address}>
      {record.address || '—'}
    </td>
    <td className="px-3 py-2 text-slate-300">{record.phone || '—'}</td>
    <td className="px-3 py-2 text-slate-300 max-w-[170px] truncate" title={record.email}>
      {record.email || '—'}
    </td>
    <td className="px-3 py-2 text-blue-400 max-w-[160px] truncate">
      {record.website ? <span title={record.website}>{record.website}</span> : '—'}
    </td>
    <td className="px-3 py-2 text-yellow-400">
      {record.rating > 0 ? `★ ${record.rating}` : '—'}
    </td>
    <td className="px-3 py-2 text-slate-300">
      {record.reviews > 0 ? record.reviews.toLocaleString() : '—'}
    </td>
    <td className="px-3 py-2 text-slate-400 max-w-[130px] truncate" title={record.category}>
      {record.category || '—'}
    </td>
    <td className="px-3 py-2 text-slate-400 font-mono text-xs">
      {record.plusCode || '—'}
    </td>
    <td className="px-3 py-2 text-slate-400 font-mono text-xs">
      {record.latitude != null ? record.latitude.toFixed(6) : '—'}
    </td>
    <td className="px-3 py-2 text-slate-400 font-mono text-xs">
      {record.longitude != null ? record.longitude.toFixed(6) : '—'}
    </td>
    <td className="px-3 py-2">
      {record.photoUrl ? (
        <a href={record.photoUrl} target="_blank" rel="noreferrer"
           className="text-purple-400 hover:text-purple-300 underline"
           onClick={(e) => e.stopPropagation()}>
          View
        </a>
      ) : '—'}
    </td>
    <td className="px-3 py-2">
      {record.mapsUrl ? (
        <a href={record.mapsUrl} target="_blank" rel="noreferrer"
           className="text-blue-500 hover:text-blue-400 underline"
           onClick={(e) => e.stopPropagation()}>
          View
        </a>
      ) : '—'}
    </td>
  </tr>
);

export default SessionDataModal;
