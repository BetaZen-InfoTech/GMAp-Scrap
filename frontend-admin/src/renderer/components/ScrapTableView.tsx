import React, { useState } from 'react';
import type { ScrapedDataRecord } from '../../shared/types';

interface ScrapTableViewProps {
  records: ScrapedDataRecord[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
}

const ScrapTableView: React.FC<ScrapTableViewProps> = ({ records, selectedIds, onToggleSelect }) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  return (
    <>
      <div className="overflow-auto flex-1">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-900 z-10">
            <tr className="border-b border-slate-800">
              <th className="px-3 py-3 w-10">
                <span className="sr-only">Select</span>
              </th>
              <th className="px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-left w-12">Photo</th>
              <th className="px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-left">Name</th>
              <th className="px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-left">Phone</th>
              <th className="px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-left">Email</th>
              <th className="px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-left">Address</th>
              <th className="px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-left">Website</th>
              <th className="px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-left">Category</th>
              <th className="px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-left">Pincode</th>
              <th className="px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-left">Rating</th>
              <th className="px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-left">Reviews</th>
              <th className="px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-left">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {records.map((rec) => (
              <tr
                key={rec._id}
                className={`transition-colors ${selectedIds.has(rec._id) ? 'bg-blue-900/20' : 'hover:bg-slate-800/30'}`}
              >
                <td className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(rec._id)}
                    onChange={() => onToggleSelect(rec._id)}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
                  />
                </td>
                <td className="px-3 py-3">
                  {rec.photoUrl ? (
                    <img
                      src={rec.photoUrl}
                      alt=""
                      className="w-10 h-10 rounded-lg object-cover bg-slate-800 cursor-pointer hover:opacity-80 transition-opacity"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      onClick={() => setPreviewUrl(rec.photoUrl!)}
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center">
                      <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                </td>
                <td className="px-3 py-3 text-white font-medium max-w-[160px] truncate">{rec.name || '—'}</td>
                <td className="px-3 py-3 text-slate-300 whitespace-nowrap">{rec.phone || <span className="text-slate-600">—</span>}</td>
                <td className="px-3 py-3 text-slate-300 max-w-[140px] truncate">{rec.email || <span className="text-slate-600">—</span>}</td>
                <td className="px-3 py-3 text-slate-400 max-w-[180px] truncate">{rec.address || <span className="text-slate-600">—</span>}</td>
                <td className="px-3 py-3 max-w-[140px] truncate">
                  {rec.website ? (
                    <a href={rec.website} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 truncate">
                      {rec.website.replace(/^https?:\/\/(www\.)?/, '')}
                    </a>
                  ) : <span className="text-slate-600">—</span>}
                </td>
                <td className="px-3 py-3">
                  {rec.category ? (
                    <span className="text-[11px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded truncate max-w-[100px] inline-block">
                      {rec.category}
                    </span>
                  ) : '—'}
                </td>
                <td className="px-3 py-3 text-slate-300 whitespace-nowrap">{rec.pincode || '—'}</td>
                <td className="px-3 py-3 text-slate-300 whitespace-nowrap">
                  {rec.rating != null ? (
                    <span className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                      {rec.rating}
                    </span>
                  ) : '—'}
                </td>
                <td className="px-3 py-3 text-slate-300 whitespace-nowrap">
                  {rec.reviews != null ? rec.reviews.toLocaleString() : '—'}
                </td>
                <td className="px-3 py-3 text-slate-500 whitespace-nowrap text-xs">
                  {rec.scrapedAt ? new Date(rec.scrapedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Photo preview modal */}
      {previewUrl && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <div className="relative max-w-lg max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
            <img
              src={previewUrl}
              alt="Preview"
              className="max-w-full max-h-[80vh] rounded-xl object-contain"
              onError={() => setPreviewUrl(null)}
            />
            <button
              onClick={() => setPreviewUrl(null)}
              className="absolute -top-3 -right-3 w-8 h-8 bg-slate-800 hover:bg-slate-700 rounded-full flex items-center justify-center text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default ScrapTableView;
