import React, { useEffect, useState } from 'react';
import { useSessionStore } from '../store/useSessionStore';
import SessionCard from '../components/SessionCard';
import SettingsModal from '../components/SettingsModal';
import SessionDataModal from '../components/SessionDataModal';
import ApiLogsModal from '../components/ApiLogsModal';
import ScrapeJobPanel from '../components/ScrapeJobPanel';
import PincodeRangeModal from '../components/PincodeRangeModal';
import DeviceStatsBar from '../components/DeviceStatsBar';
import type { ScrapeJobState } from '../../shared/types';

const Dashboard: React.FC = () => {
  const { sessions, loadSessions, updateProgress, updateBatchSent, updateComplete } = useSessionStore();
  const [showSettings, setShowSettings] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showPincodeModal, setShowPincodeModal] = useState(false);
  const [dataModalSessionId, setDataModalSessionId] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');
  const [filter, setFilter] = useState<'all' | 'running' | 'completed' | 'error'>('all');
  const [scrapeJobs, setScrapeJobs] = useState<Map<string, ScrapeJobState>>(new Map());

  useEffect(() => {
    loadSessions();

    // Rehydrate all scrape jobs from main process
    window.electronAPI.getAllScrapeJobs().then((jobs) => {
      if (jobs && jobs.length > 0) {
        setScrapeJobs(new Map(jobs.map((j) => [j.jobId, j])));
      }
    });

    const offProgress = window.electronAPI.onProgress((payload) => {
      // If this session isn't in the store yet (created by scrape job), reload all
      const { sessions } = useSessionStore.getState();
      if (!sessions.has(payload.sessionId)) {
        loadSessions();
      } else {
        updateProgress(payload);
      }
    });
    const offBatch = window.electronAPI.onBatchSent((payload) => {
      updateBatchSent(payload);
    });
    const offComplete = window.electronAPI.onComplete((payload) => {
      updateComplete(payload);
      loadSessions();
    });
    const offJobProgress = window.electronAPI.onScrapeJobProgress((job) => {
      setScrapeJobs((prev) => {
        const next = new Map(prev);
        if (job.status === 'stopped') {
          next.delete(job.jobId);
        } else {
          next.set(job.jobId, { ...job });
        }
        return next;
      });
      loadSessions();
    });

    return () => {
      offProgress();
      offBatch();
      offComplete();
      offJobProgress();
    };
  }, []);

  const handleStart = async () => {
    const k = keyword.trim();
    if (!k) return;
    setStarting(true);
    setStartError('');
    try {
      const result = await window.electronAPI.startScrape({ keyword: k });
      if (result.success && result.sessionId) {
        setKeyword('');
        await loadSessions();
      } else {
        setStartError(result.error ?? 'Failed to start session');
      }
    } catch (err) {
      setStartError(err instanceof Error ? err.message : String(err));
    } finally {
      setStarting(false);
    }
  };

  const handleStop = async (sessionId: string) => {
    await window.electronAPI.stopScrape({ sessionId });
  };

  const handleRetryExcel = async (sessionId: string) => {
    await window.electronAPI.retryExcelSend(sessionId);
  };

  const handleOpenPopup = async (sessionId: string) => {
    await window.electronAPI.openPopup(sessionId);
  };

  const handleJobPause = async (jobId: string) => {
    await window.electronAPI.pauseScrapeJob(jobId);
    setScrapeJobs((prev) => {
      const next = new Map(prev);
      const job = next.get(jobId);
      if (job) next.set(jobId, { ...job, status: 'paused' });
      return next;
    });
  };

  const handleJobResume = async (jobId: string) => {
    await window.electronAPI.startScrapeJob(jobId);
    setScrapeJobs((prev) => {
      const next = new Map(prev);
      const job = next.get(jobId);
      if (job) next.set(jobId, { ...job, status: 'running' });
      return next;
    });
  };

  const handleJobStop = async (jobId: string) => {
    await window.electronAPI.stopScrapeJob(jobId);
    setScrapeJobs((prev) => {
      const next = new Map(prev);
      next.delete(jobId);
      return next;
    });
  };

  const handleSessionClick = (sessionId: string) => {
    setDataModalSessionId(sessionId);
  };

  const sessionList = Array.from(sessions.values());
  const filtered = filter === 'all'
    ? sessionList
    : sessionList.filter((s) => s.status === filter);

  const running = sessionList.filter((s) => s.status === 'running').length;
  const completed = sessionList.filter((s) => s.status === 'completed').length;
  const errors = sessionList.filter((s) => s.status === 'error').length;
  const totalScraped = sessionList.reduce((sum, s) => sum + s.totalScraped, 0);

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Top Bar */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-sm font-bold">G</div>
          <div>
            <h1 className="text-base font-bold text-white leading-tight">Google Maps Scraper</h1>
            <p className="text-xs text-slate-500 leading-tight">BetaZen InfoTech</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Open Excel Folder */}
          <button
            onClick={() => window.electronAPI.openExcelFolder()}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded-lg transition-colors"
            title="Open Excel files folder"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
            </svg>
            Excel Folder
          </button>

          {/* API Logs */}
          <button
            onClick={() => setShowLogs(true)}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            API Logs
          </button>

          {/* Settings */}
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Settings
          </button>
        </div>
      </header>

      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        {/* Device Stats Bar (live) */}
        <DeviceStatsBar />

        {/* Stats Row */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Active Sessions', value: running, color: 'text-green-400' },
            { label: 'Completed', value: completed, color: 'text-blue-400' },
            { label: 'Errors', value: errors, color: 'text-red-400' },
            { label: 'Total Scraped', value: totalScraped.toLocaleString(), color: 'text-white' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className={`text-2xl font-bold ${color}`}>{value}</div>
              <div className="text-xs text-slate-400 mt-1">{label}</div>
            </div>
          ))}
        </div>

        {/* Start New Scrape */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-300">New Scrape Session</h2>
            <button
              onClick={() => setShowPincodeModal(true)}
              className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 px-3 py-1.5 rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              Pincode Range
            </button>
          </div>
          <div className="flex gap-3">
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleStart()}
              placeholder="Search keyword or Google Maps URL…"
              autoComplete="off"
              className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleStart}
              disabled={starting || !keyword.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-500 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              {starting ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Starting…
                </>
              ) : (
                'Launch Scrape'
              )}
            </button>
          </div>
          {startError && (
            <p className="mt-2 text-xs text-red-400">{startError}</p>
          )}
        </div>

        {/* Scrape Job Panels */}
        {scrapeJobs.size > 0 && (
          <div className="mb-6 space-y-3">
            {Array.from(scrapeJobs.values()).map((job) => (
              <ScrapeJobPanel
                key={job.jobId}
                job={job}
                onPause={handleJobPause}
                onResume={handleJobResume}
                onStop={handleJobStop}
              />
            ))}
          </div>
        )}

        {/* Session List */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white">Sessions ({sessionList.length})</h2>
          <div className="flex gap-1">
            {(['all', 'running', 'completed', 'error'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                  filter === f
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-600">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            <p className="text-sm text-slate-500">No sessions yet. Launch a new scrape above.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                onStop={handleStop}
                onRetryExcel={handleRetryExcel}
                onClick={handleSessionClick}
                onOpenPopup={handleOpenPopup}
              />
            ))}
          </div>
        )}
      </main>

      <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} />
      <ApiLogsModal open={showLogs} onClose={() => setShowLogs(false)} />
      <SessionDataModal
        sessionId={dataModalSessionId}
        onClose={() => setDataModalSessionId(null)}
      />
      <PincodeRangeModal
        open={showPincodeModal}
        onClose={() => setShowPincodeModal(false)}
        onJobStarted={(job) => setScrapeJobs((prev) => new Map(prev).set(job.jobId, job))}
      />
    </div>
  );
};

export default Dashboard;
