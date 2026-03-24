import React, { useEffect, useState } from 'react';
import { useSessionStore } from '../store/useSessionStore';
import { useDeviceStore } from '../store/useDeviceStore';
import SessionTable from '../components/SessionTable';
import Pagination from '../components/Pagination';
import Spinner from '../components/Spinner';

const SessionsPage: React.FC = () => {
  const { sessions, total, page, limit, loading, filters, fetchSessions, setLimit, setFilters } = useSessionStore();
  const { devices, fetchDevices } = useDeviceStore();

  const [localKeyword, setLocalKeyword] = useState(filters.keyword || '');

  useEffect(() => {
    fetchDevices();
    fetchSessions(1);
  }, []);

  const applyFilters = () => {
    setFilters({ keyword: localKeyword || undefined });
    fetchSessions(1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') applyFilters();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white">Sessions</h2>
        <p className="text-sm text-slate-500 mt-0.5">{total} total sessions</p>
      </div>

      {/* Filters */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="flex flex-wrap gap-3">
          {/* Device Filter */}
          <select
            value={filters.deviceId || ''}
            onChange={(e) => {
              setFilters({ deviceId: e.target.value || undefined });
              fetchSessions(1);
            }}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          >
            <option value="">All Devices</option>
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.nickname || d.ip || d.hostname}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={filters.status || ''}
            onChange={(e) => {
              setFilters({ status: e.target.value || undefined });
              fetchSessions(1);
            }}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          >
            <option value="">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="error">Error</option>
            <option value="partial">Partial</option>
          </select>

          {/* Keyword Filter */}
          <input
            type="text"
            value={localKeyword}
            onChange={(e) => setLocalKeyword(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search keyword..."
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 flex-1 min-w-[200px]"
          />

          {/* Date Filters */}
          <input
            type="date"
            value={filters.from || ''}
            onChange={(e) => {
              setFilters({ from: e.target.value || undefined });
              fetchSessions(1);
            }}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          />
          <input
            type="date"
            value={filters.to || ''}
            onChange={(e) => {
              setFilters({ to: e.target.value || undefined });
              fetchSessions(1);
            }}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          />

          <button
            onClick={applyFilters}
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Search
          </button>

          {/* Clear filters */}
          {(filters.deviceId || filters.status || filters.keyword || filters.from || filters.to) && (
            <button
              onClick={() => {
                setFilters({ deviceId: undefined, status: undefined, keyword: undefined, from: undefined, to: undefined });
                setLocalKeyword('');
                fetchSessions(1);
              }}
              className="text-xs text-slate-400 hover:text-white px-3 py-2 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {loading && sessions.length === 0 ? (
        <Spinner message="Loading sessions..." />
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <SessionTable sessions={sessions} showDevice />
          <Pagination
            page={page}
            total={total}
            limit={limit}
            onPageChange={(p) => fetchSessions(p)}
            onLimitChange={(l) => { setLimit(l); setTimeout(() => fetchSessions(1), 0); }}
          />
        </div>
      )}
    </div>
  );
};

export default SessionsPage;
