import React, { useState } from 'react';
import type { ScrapedDataRecord } from '../../shared/types';

interface ScrapCardViewProps {
  records: ScrapedDataRecord[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
}

const ScrapCardView: React.FC<ScrapCardViewProps> = ({ records, selectedIds, onToggleSelect }) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 overflow-auto flex-1 p-1">
        {records.map((rec) => (
          <div
            key={rec._id}
            className={`bg-slate-800/50 border rounded-xl overflow-hidden transition-all hover:border-slate-600 ${
              selectedIds.has(rec._id) ? 'border-blue-500 ring-1 ring-blue-500/30' : 'border-slate-700/60'
            }`}
          >
            {/* Photo banner */}
            <div className="relative h-32 bg-slate-800">
              {rec.photoUrl ? (
                <img
                  src={rec.photoUrl}
                  alt=""
                  className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  onClick={() => setPreviewUrl(rec.photoUrl!)}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <svg className="w-10 h-10 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              )}
              {/* Checkbox overlay */}
              <div className="absolute top-2 right-2">
                <input
                  type="checkbox"
                  checked={selectedIds.has(rec._id)}
                  onChange={() => onToggleSelect(rec._id)}
                  className="w-5 h-5 rounded border-slate-500 bg-slate-800/80 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
                />
              </div>
              {/* Category badge */}
              {rec.category && (
                <div className="absolute bottom-2 left-2">
                  <span className="text-[11px] bg-black/60 text-white px-2 py-0.5 rounded-full backdrop-blur-sm">
                    {rec.category}
                  </span>
                </div>
              )}
            </div>

            {/* Content */}
            <div className="p-4 space-y-3">
              {/* Name + Rating */}
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-white leading-tight truncate flex-1">
                  {rec.name || 'Unknown Business'}
                </h3>
                {rec.rating != null && (
                  <div className="flex items-center gap-1 shrink-0">
                    <svg className="w-3.5 h-3.5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    <span className="text-xs text-slate-300">{rec.rating}</span>
                    {rec.reviews != null && (
                      <span className="text-[11px] text-slate-500">({rec.reviews.toLocaleString()})</span>
                    )}
                  </div>
                )}
              </div>

              {/* Contact info */}
              <div className="space-y-1.5">
                {rec.phone && (
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <svg className="w-3.5 h-3.5 text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    <span>{rec.phone}</span>
                  </div>
                )}
                {rec.email && (
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <svg className="w-3.5 h-3.5 text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span className="truncate">{rec.email}</span>
                  </div>
                )}
                {rec.website && (
                  <div className="flex items-center gap-2 text-xs">
                    <svg className="w-3.5 h-3.5 text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                    </svg>
                    <a href={rec.website} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 truncate">
                      {rec.website.replace(/^https?:\/\/(www\.)?/, '')}
                    </a>
                  </div>
                )}
                {rec.address && (
                  <div className="flex items-start gap-2 text-xs text-slate-400">
                    <svg className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="line-clamp-2">{rec.address}</span>
                  </div>
                )}
              </div>

              {/* Footer: Pincode */}
              <div className="flex items-center justify-between pt-1 border-t border-slate-700/40">
                <span className="text-[11px] text-slate-500">
                  {rec.pincode ? `Pin: ${rec.pincode}` : ''}
                </span>
                {rec.mapsUrl && (
                  <a
                    href={rec.mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-blue-400 hover:text-blue-300"
                  >
                    View on Maps
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Photo preview modal */}
      {previewUrl && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setPreviewUrl(null)}>
          <div className="relative max-w-lg max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
            <img src={previewUrl} alt="Preview" className="max-w-full max-h-[80vh] rounded-xl object-contain" onError={() => setPreviewUrl(null)} />
            <button onClick={() => setPreviewUrl(null)} className="absolute -top-3 -right-3 w-8 h-8 bg-slate-800 hover:bg-slate-700 rounded-full flex items-center justify-center text-white transition-colors">
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

export default ScrapCardView;
