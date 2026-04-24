import React, { useState } from 'react';
import type { ScrapedDataRecord } from '../../shared/types';

interface ScrapCardViewProps {
  records: ScrapedDataRecord[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
}

function RatingStars({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.3;
  const stars = [];
  for (let i = 0; i < 5; i++) {
    if (i < full) stars.push('full');
    else if (i === full && half) stars.push('half');
    else stars.push('empty');
  }
  return (
    <div className="flex gap-px">
      {stars.map((s, i) => (
        <svg key={i} className={`w-3 h-3 ${s === 'empty' ? 'text-slate-600' : 'text-yellow-400'}`} fill="currentColor" viewBox="0 0 20 20">
          {s === 'half' ? (
            <>
              <defs><clipPath id={`half-${i}`}><rect x="0" y="0" width="10" height="20" /></clipPath></defs>
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" fill="currentColor" clipPath={`url(#half-${i})`} />
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-slate-600" />
            </>
          ) : (
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          )}
        </svg>
      ))}
    </div>
  );
}

const InfoRow: React.FC<{ icon: React.ReactNode; children: React.ReactNode; color?: string }> = ({ icon, children }) => (
  <div className="flex items-center gap-2 min-w-0">
    <span className="shrink-0">{icon}</span>
    <span className="text-[11px] text-slate-200 truncate">{children}</span>
  </div>
);

const ScrapCardView: React.FC<ScrapCardViewProps> = ({ records, selectedIds, onToggleSelect }) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 overflow-auto flex-1 p-4">
        {records.map((rec) => {
          const selected = selectedIds.has(rec._id);
          const hasContact = rec.phone || rec.email || rec.website || rec.address;
          return (
            <div
              key={rec._id}
              className={`relative rounded-2xl overflow-hidden transition-all duration-200 group
                bg-white/[0.04] backdrop-blur-xl border
                hover:bg-white/[0.07] hover:shadow-2xl hover:shadow-blue-900/10 hover:-translate-y-0.5
                ${selected
                  ? 'border-blue-500/60 ring-1 ring-blue-500/20 shadow-lg shadow-blue-500/5'
                  : 'border-white/[0.08]'
                }`}
            >
              {/* Photo header */}
              <div className="relative h-36 bg-gradient-to-br from-slate-800 to-slate-900 overflow-hidden">
                {rec.photoUrl ? (
                  <img
                    src={rec.photoUrl}
                    alt=""
                    className="w-full h-full object-cover cursor-pointer group-hover:scale-105 transition-transform duration-300"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    onClick={() => setPreviewUrl(rec.photoUrl!)}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800/80 to-slate-900">
                    <svg className="w-12 h-12 text-slate-700/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={0.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

                {/* Checkbox - glassmorphism */}
                <div className="absolute top-2.5 left-2.5">
                  <label className="flex items-center justify-center w-6 h-6 rounded-lg bg-white/10 backdrop-blur-md border border-white/20 cursor-pointer hover:bg-white/20 transition-colors">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(e) => { e.stopPropagation(); onToggleSelect(rec._id); }}
                      className="w-3.5 h-3.5 rounded border-white/30 bg-transparent text-blue-500 focus:ring-0 cursor-pointer"
                    />
                  </label>
                </div>

                {/* Rating badge - glassmorphism */}
                {rec.rating != null && (
                  <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 bg-black/40 backdrop-blur-md rounded-lg px-2 py-1 border border-white/10">
                    <svg className="w-3 h-3 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    <span className="text-xs font-bold text-white">{rec.rating}</span>
                    {rec.reviews != null && (
                      <span className="text-[10px] text-white/60">({rec.reviews.toLocaleString()})</span>
                    )}
                  </div>
                )}

                {/* Name overlay at bottom */}
                <div className="absolute bottom-0 left-0 right-0 px-3 pb-2.5">
                  <h3 className="text-sm font-bold text-white leading-tight truncate drop-shadow-lg" title={rec.name || ''}>
                    {rec.name || 'Unknown Business'}
                  </h3>
                  {rec.rating != null && (
                    <div className="mt-1">
                      <RatingStars rating={rec.rating} />
                    </div>
                  )}
                </div>
              </div>

              {/* Category + SubCategory tags */}
              <div className="flex flex-wrap gap-1.5 px-3.5 pt-3">
                {rec.category && (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 truncate max-w-[45%]" title={rec.category}>
                    {rec.category}
                  </span>
                )}
                {rec.scrapCategory && rec.scrapCategory !== rec.category && (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 truncate max-w-[45%]" title={rec.scrapCategory}>
                    {rec.scrapCategory}
                  </span>
                )}
                {rec.scrapSubCategory && (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 truncate max-w-[45%]" title={rec.scrapSubCategory}>
                    {rec.scrapSubCategory}
                  </span>
                )}
              </div>

              {/* Contact details */}
              <div className="px-3.5 pt-2.5 pb-1 space-y-1.5">
                {rec.phone && (
                  <InfoRow icon={
                    <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  }>
                    <span className="inline-flex items-center gap-1.5">
                      <span>{rec.phone}</span>
                      {rec.numberFixing && (
                        <span
                          title="Number normalized (+91 format)"
                          className="text-[9px] uppercase font-semibold text-indigo-300 bg-indigo-900/50 border border-indigo-700/60 rounded px-1 py-px"
                        >
                          Fixed
                        </span>
                      )}
                    </span>
                  </InfoRow>
                )}
                {rec.email && (
                  <InfoRow icon={
                    <svg className="w-3 h-3 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  }>{rec.email}</InfoRow>
                )}
                {rec.website && (
                  <div className="flex items-center gap-2 min-w-0">
                    <svg className="w-3 h-3 text-violet-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                    </svg>
                    <a href={rec.website} target="_blank" rel="noopener noreferrer" className="text-[11px] text-blue-400 hover:text-blue-300 truncate transition-colors">
                      {rec.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                    </a>
                  </div>
                )}
                {rec.address && (
                  <div className="flex items-start gap-2 min-w-0">
                    <svg className="w-3 h-3 text-rose-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">{rec.address}</span>
                  </div>
                )}
                {!hasContact && (
                  <p className="text-[11px] text-slate-600 italic py-1">No contact details</p>
                )}
              </div>

              {/* Footer - glassmorphism bar */}
              <div className="mx-3 mb-3 mt-1.5 flex items-center justify-between rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  {rec.pincode && (
                    <span className="text-[10px] font-mono font-medium text-slate-400 bg-white/[0.06] px-1.5 py-0.5 rounded-md border border-white/[0.06]">
                      {rec.pincode}
                    </span>
                  )}
                  {rec.scrapRound != null && (
                    <span className="text-[10px] font-medium text-amber-400/80 bg-amber-500/10 px-1.5 py-0.5 rounded-md border border-amber-500/15">
                      R{rec.scrapRound}
                    </span>
                  )}
                  {rec.isDuplicate && (
                    <span className="text-[10px] font-medium text-red-400/80 bg-red-500/10 px-1.5 py-0.5 rounded-md border border-red-500/15">
                      Dup
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {rec.scrapedAt && (
                    <span className="text-[9px] text-slate-500">
                      {new Date(rec.scrapedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  )}
                  {rec.mapsUrl && (
                    <a
                      href={rec.mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[10px] font-medium text-blue-400 hover:text-blue-300 transition-colors bg-blue-500/10 px-1.5 py-0.5 rounded-md border border-blue-500/15"
                    >
                      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      Maps
                    </a>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Photo preview modal - glassmorphism */}
      {previewUrl && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setPreviewUrl(null)}>
          <div className="relative max-w-2xl max-h-[85vh] rounded-2xl overflow-hidden border border-white/10 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <img src={previewUrl} alt="Preview" className="max-w-full max-h-[85vh] object-contain" onError={() => setPreviewUrl(null)} />
            <button
              onClick={() => setPreviewUrl(null)}
              className="absolute top-3 right-3 w-8 h-8 bg-black/40 backdrop-blur-md hover:bg-black/60 border border-white/20 rounded-full flex items-center justify-center text-white transition-colors"
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

export default ScrapCardView;
