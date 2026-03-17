import React, { useEffect, useState, useCallback } from 'react';
import type { ScrapedDataRecord, SessionStatsRecord } from '../../shared/types';
import api from '../lib/api';

interface Props {
  session: SessionStatsRecord;
  onClose: () => void;
}

const LIMIT = 100;

const columns: { key: keyof ScrapedDataRecord; label: string; width: string }[] = [
  { key: 'name',            label: 'Name',       width: '160px' },
  { key: 'phone',           label: 'Phone',      width: '110px' },
  { key: 'address',         label: 'Address',    width: '200px' },
  { key: 'rating',          label: 'Rating',     width: '55px'  },
  { key: 'reviews',         label: 'Reviews',    width: '65px'  },
  { key: 'category',        label: 'Category',   width: '120px' },
  { key: 'pincode',         label: 'Pincode',    width: '72px'  },
  { key: 'website',         label: 'Website',    width: '150px' },
  { key: 'email',           label: 'Email',      width: '150px' },
  { key: 'plusCode',        label: 'PlusCode',   width: '100px' },
  { key: 'scrapSubCategory',label: 'Sub-Cat',    width: '100px' },
];

const SessionRecordsModal: React.FC<Props> = ({ session: s, onClose }) => {
  const [records, setRecords] = useState<ScrapedDataRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/api/admin/sessions/${s.sessionId}/records`, {
        params: { page: p, limit: LIMIT },
      });
      setRecords(res.data.data);
      setTotal(res.data.total);
      setPage(p);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to load records');
    } finally {
      setLoading(false);
    }
  }, [s.sessionId]);

  useEffect(() => { fetchPage(1); }, [fetchPage]);

  const totalPages = Math.ceil(total / LIMIT);

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black/80 backdrop-blur-sm p-4"
      onClick={handleBackdrop}
    >
      <div
        className="w-full max-w-[98vw] mx-auto bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col h-full max-h-[96vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-white">Scraped Records</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              <span className="font-mono">{s.sessionId}</span>
              {s.keyword && <span className="ml-2 text-slate-400">— {s.keyword}</span>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">{total} record{total !== 1 ? 's' : ''}</span>
            <button
              onClick={onClose}
              className="text-slate-500 hover:text-white transition-colors text-xl leading-none px-1"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden flex flex-col px-4 py-3 gap-3 min-h-0">
          {loading && (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
              Loading…
            </div>
          )}
          {error && (
            <div className="flex-1 flex items-center justify-center text-red-400 text-sm">
              {error}
            </div>
          )}
          {!loading && !error && (
            <div className="flex-1 overflow-auto border border-slate-700 rounded-lg min-h-0">
              <table className="text-xs font-mono border-collapse w-max min-w-full">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-800">
                    <th className="px-2 py-1.5 border-r border-b border-slate-700 text-center text-slate-500 w-10">#</th>
                    {columns.map((col) => (
                      <th
                        key={col.key}
                        className="px-2 py-1.5 border-r border-b border-slate-700 text-left text-slate-400 font-semibold whitespace-nowrap"
                        style={{ minWidth: col.width }}
                      >
                        {col.label}
                      </th>
                    ))}
                    <th className="px-2 py-1.5 border-b border-slate-700 text-center text-slate-400 font-semibold whitespace-nowrap w-16">Dup</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((rec, idx) => (
                    <tr
                      key={rec._id}
                      className={`${
                        rec.isDuplicate
                          ? 'bg-yellow-900/10'
                          : idx % 2 === 0 ? 'bg-slate-900' : 'bg-slate-900/50'
                      } hover:bg-slate-800/60 transition-colors`}
                    >
                      <td className="px-2 py-1 border-r border-slate-800 text-center text-slate-600">
                        {(page - 1) * LIMIT + idx + 1}
                      </td>
                      {columns.map((col) => {
                        const val = rec[col.key];
                        const display = val != null && val !== '' ? String(val) : '';
                        return (
                          <td
                            key={col.key}
                            className={`px-2 py-1 border-r border-slate-800 whitespace-nowrap truncate ${
                              display ? 'text-slate-300' : 'text-slate-700'
                            }`}
                            style={{ maxWidth: col.width }}
                            title={display}
                          >
                            {display || '—'}
                          </td>
                        );
                      })}
                      <td className="px-2 py-1 border-slate-800 text-center">
                        {rec.isDuplicate
                          ? <span className="text-yellow-400">DUP</span>
                          : <span className="text-slate-700">—</span>
                        }
                      </td>
                    </tr>
                  ))}
                  {records.length === 0 && (
                    <tr>
                      <td colSpan={columns.length + 2} className="px-4 py-8 text-center text-slate-500">
                        No records found for this session.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {!loading && !error && totalPages > 1 && (
            <div className="flex items-center justify-between shrink-0">
              <p className="text-xs text-slate-500">
                Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}
              </p>
              <div className="flex gap-1">
                <button
                  onClick={() => fetchPage(page - 1)}
                  disabled={page <= 1}
                  className="px-3 py-1 text-xs rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Prev
                </button>
                <span className="px-3 py-1 text-xs text-slate-400">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => fetchPage(page + 1)}
                  disabled={page >= totalPages}
                  className="px-3 py-1 text-xs rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default SessionRecordsModal;
