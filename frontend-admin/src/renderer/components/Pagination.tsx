import React, { useState } from 'react';

const PAGE_SIZES = [10, 25, 50, 100, 250, 500, 750, 1000];

interface PaginationProps {
  page: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
  onLimitChange?: (limit: number) => void;
}

const Pagination: React.FC<PaginationProps> = ({ page, total, limit, onPageChange, onLimitChange }) => {
  const [jumpPage, setJumpPage] = useState('');
  const totalPages = Math.ceil(total / limit) || 1;

  const handleJump = () => {
    const p = parseInt(jumpPage, 10);
    if (p >= 1 && p <= totalPages) {
      onPageChange(p);
      setJumpPage('');
    }
  };

  if (total === 0) return null;

  return (
    <div className="flex items-center justify-between mt-4 gap-4 flex-wrap">
      {/* Left: page size + showing info */}
      <div className="flex items-center gap-3">
        {onLimitChange && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500">Show</span>
            <select
              value={limit}
              onChange={e => onLimitChange(Number(e.target.value))}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
            >
              {PAGE_SIZES.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        )}
        <span className="text-xs text-slate-500">
          Showing {((page - 1) * limit) + 1}–{Math.min(page * limit, total)} of {total.toLocaleString()}
        </span>
      </div>

      {/* Center: page buttons */}
      {totalPages > 1 && (
        <div className="flex gap-1">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="px-3 py-1.5 text-xs rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            let pageNum: number;
            if (totalPages <= 7) {
              pageNum = i + 1;
            } else if (page <= 4) {
              pageNum = i + 1;
            } else if (page >= totalPages - 3) {
              pageNum = totalPages - 6 + i;
            } else {
              pageNum = page - 3 + i;
            }
            return (
              <button
                key={pageNum}
                onClick={() => onPageChange(pageNum)}
                className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                  pageNum === page
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {pageNum}
              </button>
            );
          })}
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="px-3 py-1.5 text-xs rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      )}

      {/* Right: jump to page */}
      {totalPages > 1 && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500">Go to</span>
          <input
            type="number"
            min={1}
            max={totalPages}
            value={jumpPage}
            onChange={e => setJumpPage(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleJump()}
            placeholder={String(page)}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white w-16 focus:outline-none focus:border-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <button
            onClick={handleJump}
            className="bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 transition-colors"
          >
            Go
          </button>
          <span className="text-xs text-slate-600">/ {totalPages}</span>
        </div>
      )}
    </div>
  );
};

export default Pagination;
