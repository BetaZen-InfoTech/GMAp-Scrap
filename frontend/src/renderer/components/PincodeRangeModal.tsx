import React, { useState, useEffect } from 'react';
import { ScrapeJobState } from '../../shared/types';

interface PincodeRangeModalProps {
  open: boolean;
  onClose: () => void;
  onJobStarted: (job: ScrapeJobState) => void;
}

const ROUNDS = 3;

const PincodeRangeModal: React.FC<PincodeRangeModalProps> = ({ open, onClose, onJobStarted }) => {
  const [startPincode, setStartPincode] = useState('');
  const [endPincode, setEndPincode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [nicheCount, setNicheCount] = useState<number | null>(null);

  // Fetch actual niche count from backend when modal opens
  useEffect(() => {
    if (!open) return;
    setNicheCount(null);
    (async () => {
      try {
        const base = await window.electronAPI.getApiBaseUrl();
        const res = await fetch(`${base}/api/niches`);
        if (res.ok) {
          const niches = await res.json();
          setNicheCount(Array.isArray(niches) ? niches.length : 0);
        }
      } catch {
        // Fallback: count will show after job loads
      }
    })();
  }, [open]);

  if (!open) return null;

  const startNum = parseInt(startPincode, 10);
  const endNum = parseInt(endPincode, 10);
  const validRange =
    !isNaN(startNum) &&
    !isNaN(endNum) &&
    startNum >= 100000 &&
    startNum <= 999999 &&
    endNum >= startNum;

  const PINCODES_PER_JOB = 100;
  const estimatedPincodes = validRange ? Math.min(Math.max(1, endNum - startNum + 1), PINCODES_PER_JOB) : 0;
  const displayNicheCount = nicheCount ?? '…';
  const estimatedSearches = nicheCount != null ? estimatedPincodes * nicheCount * ROUNDS : null;

  const handleStart = async () => {
    if (!validRange) return;
    setLoading(true);
    setError('');

    try {
      // Load job (fetches pincodes + niches from backend)
      const loadResult = await window.electronAPI.loadScrapeJob({
        startPincode: startNum,
        endPincode: endNum,
      });

      if (!loadResult.success || !loadResult.job) {
        setError(loadResult.error ?? 'Failed to load job data from backend');
        return;
      }

      // Start the job (pass jobId)
      const startResult = await window.electronAPI.startScrapeJob(loadResult.job.jobId);
      if (!startResult.success) {
        setError(startResult.error ?? 'Failed to start scrape job');
        return;
      }

      onJobStarted(loadResult.job);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-white">Pincode Range Scrape</h2>
            <p className="text-xs text-slate-400 mt-0.5">Bulk scraping by pincode range with 3 rounds per niche</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Pincode inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Start Pincode</label>
              <input
                type="number"
                value={startPincode}
                onChange={(e) => { setStartPincode(e.target.value); setError(''); }}
                placeholder="e.g. 700001"
                min={100000}
                max={999999}
                disabled={loading}
                className="w-full bg-slate-800 border border-slate-600 text-white placeholder-slate-500 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 transition"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">End Pincode</label>
              <input
                type="number"
                value={endPincode}
                onChange={(e) => { setEndPincode(e.target.value); setError(''); }}
                placeholder="e.g. 700010"
                min={100000}
                max={999999}
                disabled={loading}
                className="w-full bg-slate-800 border border-slate-600 text-white placeholder-slate-500 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 transition"
              />
            </div>
          </div>

          {/* Preview */}
          {validRange && (
            <div className="bg-slate-800/60 border border-slate-700 rounded-lg px-4 py-3">
              <p className="text-xs text-slate-400 leading-relaxed">
                <span className="text-white font-medium">~{estimatedPincodes.toLocaleString()}</span> pincodes
                {' × '}
                <span className="text-white font-medium">{displayNicheCount}</span> niches
                {' × '}
                <span className="text-white font-medium">{ROUNDS}</span> rounds
                {' = '}
                <span className="text-blue-400 font-semibold">
                  {estimatedSearches != null ? `~${estimatedSearches.toLocaleString()}` : '…'}
                </span> total searches
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Max {PINCODES_PER_JOB} pincodes per job. Actual count may differ based on unique pincodes in the database.
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
              <svg className="w-4 h-4 text-red-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 pb-5">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 text-sm font-medium py-2.5 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleStart}
            disabled={loading || !validRange}
            className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Loading…
              </>
            ) : (
              'Start Job'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PincodeRangeModal;
