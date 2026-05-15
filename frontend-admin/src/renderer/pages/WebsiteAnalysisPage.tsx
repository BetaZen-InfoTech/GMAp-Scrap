import React, { useEffect, useState, useCallback } from 'react';
import { useWebsiteAnalysisStore } from '../store/useWebsiteAnalysisStore';
import type { WebsiteAnalysisJob } from '../store/useWebsiteAnalysisStore';
import Pagination from '../components/Pagination';
import Spinner from '../components/Spinner';

type Tab = 'jobs' | 'records';

const STATUS_STYLES: Record<WebsiteAnalysisJob['status'], string> = {
  queued:    'bg-slate-700 text-slate-300',
  running:   'bg-blue-500/20 text-blue-300 border border-blue-500/40',
  completed: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40',
  error:     'bg-red-500/20 text-red-300 border border-red-500/40',
  stopped:   'bg-amber-500/20 text-amber-300 border border-amber-500/40',
};

function fmt(d?: string) {
  return d ? new Date(d).toLocaleString() : '—';
}

function durationLabel(j: WebsiteAnalysisJob) {
  if (!j.startedAt) return '—';
  const end = j.completedAt || j.lastProgressAt || new Date().toISOString();
  const ms = new Date(end).getTime() - new Date(j.startedAt).getTime();
  if (ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

const WebsiteAnalysisPage: React.FC = () => {
  const {
    jobs, jobsTotal, jobsPage, jobsLimit, jobsLoading, archiveTotal,
    records, recordsTotal, recordsPage, recordsLimit, recordsLoading, recordsSearch,
    starting, startResult, startError,
    fetchJobs, pollActiveJob, start, fetchRecords,
    setRecordsSearch, setRecordsLimit, clearStartResult,
  } = useWebsiteAnalysisStore();

  const [tab, setTab] = useState<Tab>('jobs');
  const [searchInput, setSearchInput] = useState('');
  const [confirmStart, setConfirmStart] = useState(false);

  useEffect(() => {
    fetchJobs(1);
  }, []);

  useEffect(() => {
    if (tab === 'records') fetchRecords(1);
  }, [tab]);

  // Live progress polling while a job is running.
  useEffect(() => {
    const active = jobs.find((j) => j.status === 'running' || j.status === 'queued');
    if (!active) return;
    const id = setInterval(async () => {
      const fresh = await pollActiveJob();
      // When the run transitions out of running, refresh totals + archive count.
      if (fresh && fresh.status !== 'running' && fresh.status !== 'queued') {
        fetchJobs(jobsPage);
      }
    }, 3000);
    return () => clearInterval(id);
  }, [jobs, jobsPage]);

  const handleSearch = useCallback(() => {
    setRecordsSearch(searchInput);
    setTimeout(() => fetchRecords(1), 0);
  }, [searchInput, setRecordsSearch, fetchRecords]);

  const handleStart = async () => {
    setConfirmStart(false);
    await start();
  };

  const activeJob = jobs.find((j) => j.status === 'running' || j.status === 'queued');
  const lastJob = jobs[0];
  const headerJob = activeJob || lastJob;

  return (
    <div className="p-6 space-y-6 min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 010 18M12 3a15 15 0 000 18" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold text-white leading-tight">Website Analysis</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Deduped archive of every G-Map record with a website — one row per unique website
            </p>
          </div>
        </div>

        <button
          onClick={() => setConfirmStart(true)}
          disabled={starting || !!activeJob}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors shadow-lg shadow-violet-900/30"
          title={activeJob ? 'A job is already running' : 'Start a new website-dedup run'}
        >
          {starting ? (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          {starting ? 'Starting…' : activeJob ? 'Running…' : 'Start Analysis'}
        </button>
      </div>

      {/* Start result + error banners */}
      {startResult && (
        <div className={`flex items-center justify-between border rounded-xl px-5 py-3.5 ${
          startResult.alreadyRunning
            ? 'bg-amber-500/10 border-amber-500/30'
            : 'bg-emerald-500/10 border-emerald-500/30'
        }`}>
          <p className={`text-sm font-semibold ${startResult.alreadyRunning ? 'text-amber-300' : 'text-emerald-300'}`}>
            {startResult.message}
          </p>
          <button onClick={clearStartResult} className="text-slate-500 hover:text-slate-300 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      {startError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-5 py-3.5 text-sm text-red-300">
          {startError}
        </div>
      )}

      {/* Active/last job progress card */}
      {headerJob && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className={`text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded ${STATUS_STYLES[headerJob.status]}`}>
                {headerJob.status}
              </span>
              <span className="text-xs text-slate-500">
                started {fmt(headerJob.startedAt)} · duration {durationLabel(headerJob)}
              </span>
            </div>
            <span className="text-xs text-slate-500 font-mono">
              {headerJob._id.slice(-8)}
            </span>
          </div>

          {/* Progress bar */}
          {headerJob.totalToProcess > 0 && (
            <div className="mb-4">
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-slate-400">
                  {headerJob.processed.toLocaleString()} / {headerJob.totalToProcess.toLocaleString()} processed
                </span>
                <span className="text-slate-300">
                  {Math.min(100, Math.round((headerJob.processed / headerJob.totalToProcess) * 100))}%
                </span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    headerJob.status === 'running' ? 'bg-blue-500' :
                    headerJob.status === 'completed' ? 'bg-emerald-500' :
                    headerJob.status === 'error' ? 'bg-red-500' :
                    'bg-slate-500'
                  }`}
                  style={{ width: `${Math.min(100, (headerJob.processed / headerJob.totalToProcess) * 100)}%` }}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-slate-500">Processed</p>
              <p className="text-xl font-bold text-white">{headerJob.processed.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Inserted (unique websites)</p>
              <p className="text-xl font-bold text-emerald-400">{headerJob.inserted.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Skipped (duplicates)</p>
              <p className="text-xl font-bold text-slate-400">{headerJob.skipped.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Errored</p>
              <p className={`text-xl font-bold ${headerJob.errored > 0 ? 'text-red-400' : 'text-slate-500'}`}>
                {headerJob.errored.toLocaleString()}
              </p>
            </div>
          </div>

          {headerJob.errorMessage && (
            <p className="text-xs text-red-400 mt-3">{headerJob.errorMessage}</p>
          )}
        </div>
      )}

      {/* Archive stat card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
          <svg className="w-5 h-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8" />
          </svg>
        </div>
        <div>
          <p className="text-2xl font-bold text-white">{archiveTotal.toLocaleString()}</p>
          <p className="text-xs text-slate-500 mt-0.5">Records in Website-Analysis (unique websites)</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-900/60 border border-slate-800 rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab('jobs')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === 'jobs' ? 'bg-violet-500 text-white shadow' : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          Job History
          <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${tab === 'jobs' ? 'bg-white/20' : 'bg-slate-700'}`}>
            {jobsTotal.toLocaleString()}
          </span>
        </button>
        <button
          onClick={() => setTab('records')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === 'records' ? 'bg-violet-500 text-white shadow' : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          Browse Archive
          <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${tab === 'records' ? 'bg-white/20' : 'bg-slate-700'}`}>
            {archiveTotal.toLocaleString()}
          </span>
        </button>
      </div>

      {/* Jobs tab */}
      {tab === 'jobs' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          {jobsLoading ? (
            <div className="py-16"><Spinner message="Loading jobs…" /></div>
          ) : jobs.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-500">
              No website-analysis runs yet. Click <strong>Start Analysis</strong> to kick one off.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Started</th>
                      <th className="px-4 py-3 font-medium">Duration</th>
                      <th className="px-4 py-3 font-medium text-right">Processed</th>
                      <th className="px-4 py-3 font-medium text-right">Inserted</th>
                      <th className="px-4 py-3 font-medium text-right">Skipped</th>
                      <th className="px-4 py-3 font-medium text-right">Errored</th>
                      <th className="px-4 py-3 font-medium">Job ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {jobs.map((j) => (
                      <tr key={j._id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3">
                          <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${STATUS_STYLES[j.status]}`}>
                            {j.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{fmt(j.startedAt)}</td>
                        <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{durationLabel(j)}</td>
                        <td className="px-4 py-3 text-right text-slate-300 text-xs font-mono">{j.processed.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-emerald-400 text-xs font-mono">{j.inserted.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-slate-400 text-xs font-mono">{j.skipped.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-xs font-mono">
                          <span className={j.errored > 0 ? 'text-red-400' : 'text-slate-600'}>
                            {j.errored.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-xs font-mono">{j._id.slice(-8)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3 border-t border-slate-800">
                <Pagination
                  page={jobsPage}
                  total={jobsTotal}
                  limit={jobsLimit}
                  onPageChange={(p) => fetchJobs(p)}
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* Records tab */}
      {tab === 'records' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search website, name, phone, email…"
                className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-colors"
              />
            </div>
            <button
              onClick={handleSearch}
              className="px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors"
            >
              Search
            </button>
            {recordsSearch && (
              <button
                onClick={() => { setSearchInput(''); setRecordsSearch(''); setTimeout(() => fetchRecords(1), 0); }}
                className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm transition-colors"
              >
                Clear
              </button>
            )}
            <span className="ml-auto text-xs text-slate-500">{recordsTotal.toLocaleString()} records</span>
          </div>

          {recordsLoading ? (
            <div className="py-16"><Spinner message="Loading archive…" /></div>
          ) : records.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-500">
              {recordsSearch ? 'No records match your search.' : 'Archive is empty — run an analysis first.'}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                      <th className="px-4 py-3 font-medium">#</th>
                      <th className="px-4 py-3 font-medium">Name</th>
                      <th className="px-4 py-3 font-medium">Website</th>
                      <th className="px-4 py-3 font-medium">Phone</th>
                      <th className="px-4 py-3 font-medium">Address</th>
                      <th className="px-4 py-3 font-medium">Category</th>
                      <th className="px-4 py-3 font-medium">Pincode</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {records.map((r, i) => (
                      <tr key={r._id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3 text-slate-500 text-xs">
                          {(recordsPage - 1) * recordsLimit + i + 1}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-slate-200 font-medium line-clamp-1 max-w-[160px] block" title={r.name}>
                            {r.name || <span className="text-slate-600 italic">—</span>}
                          </span>
                        </td>
                        <td className="px-4 py-3 max-w-[200px]">
                          {r.website
                            ? <a href={r.website} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300 text-xs truncate block" title={r.website}>{r.website}</a>
                            : <span className="text-slate-600 italic text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {r.phone
                            ? <span className="text-blue-400 font-mono text-xs">{r.phone}</span>
                            : <span className="text-slate-600 italic text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3 max-w-[200px]">
                          <span className="text-slate-400 text-xs line-clamp-2 block" title={r.address}>
                            {r.address || <span className="text-slate-600 italic">—</span>}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {r.category
                            ? <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">{r.category}</span>
                            : <span className="text-slate-600 italic text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-xs font-mono">{r.pincode || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3 border-t border-slate-800">
                <Pagination
                  page={recordsPage}
                  total={recordsTotal}
                  limit={recordsLimit}
                  onPageChange={(p) => fetchRecords(p)}
                  onLimitChange={(l) => { setRecordsLimit(l); setTimeout(() => fetchRecords(1), 0); }}
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* Start-confirm modal */}
      {confirmStart && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setConfirmStart(false)}>
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-4 mb-4">
              <div className="w-10 h-10 rounded-xl bg-violet-500/15 flex items-center justify-center shrink-0 mt-0.5">
                <svg className="w-5 h-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Start website-dedup analysis?</h2>
                <p className="text-sm text-slate-400 mt-1 leading-relaxed">
                  Streams every <span className="font-mono text-slate-300">Scraped-Data</span> row where{' '}
                  <code className="text-violet-300">scrapFrom = &quot;G-Map&quot;</code> AND{' '}
                  <code className="text-violet-300">website</code> is set, and writes one row per unique
                  website to <span className="font-mono text-slate-300">Website-Analysis</span>.
                </p>
                <p className="text-xs text-slate-500 mt-2">
                  Long-running. Safe to navigate away — progress is tracked server-side and you can
                  come back to this page any time.
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmStart(false)} className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors">
                Cancel
              </button>
              <button onClick={handleStart} className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-colors">
                Start
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WebsiteAnalysisPage;
