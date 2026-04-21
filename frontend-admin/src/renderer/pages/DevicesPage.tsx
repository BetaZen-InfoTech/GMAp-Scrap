import React, { useEffect, useState, useRef } from 'react';
import { useDeviceStore } from '../store/useDeviceStore';
import DeviceCard from '../components/DeviceCard';
import Spinner from '../components/Spinner';
import api from '../lib/api';

interface DevicesPageProps {
  onDeviceClick: (deviceId: string) => void;
  onOpenSsh?: (deviceIds: string[]) => void;
}

const DevicesPage: React.FC<DevicesPageProps> = ({ onDeviceClick, onOpenSsh }) => {
  const { devices, loading, fetchDevices } = useDeviceStore();
  // 'hide' = normal view, 'show' = include archived, 'only' = only archived
  const [archiveMode, setArchiveMode] = useState<'hide' | 'show' | 'only'>('hide');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkPwOpen, setBulkPwOpen] = useState(false);
  const [bulkPwValue, setBulkPwValue] = useState('');
  const [bulkPwSaving, setBulkPwSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);
  const [showAddVps, setShowAddVps] = useState(false);
  const [addIp, setAddIp] = useState('');
  const [addPw, setAddPw] = useState('');
  const [addPin, setAddPin] = useState('');
  const [addJobs, setAddJobs] = useState('3');
  const [addSaving, setAddSaving] = useState(false);

  useEffect(() => {
    fetchDevices(archiveMode !== 'hide');
    const interval = setInterval(() => fetchDevices(archiveMode !== 'hide'), 30000);
    return () => clearInterval(interval);
  }, [archiveMode]);

  const handleArchive = async (deviceId: string) => {
    try {
      await api.patch(`/api/admin/devices/${deviceId}/archive`);
      fetchDevices(archiveMode !== 'hide');
    } catch { /* noop */ }
  };

  const handleSavePassword = async (deviceId: string, password: string) => {
    try {
      await api.patch(`/api/admin/devices/${deviceId}/vps-password`, { password });
      fetchDevices(archiveMode !== 'hide');
    } catch { /* noop */ }
  };

  const handleSaveScrapeConfig = async (deviceId: string, pincode: string, jobs: number) => {
    try {
      await api.patch(`/api/admin/devices/${deviceId}/scrape-config`, { pincode, jobs });
      fetchDevices(archiveMode !== 'hide');
    } catch { /* noop */ }
  };

  const handleSaveScrapeTasks = async (deviceId: string, tasks: import('../../shared/types').ScrapeTask[]) => {
    try {
      await api.patch(`/api/admin/devices/${deviceId}/scrape-tasks`, { tasks });
      fetchDevices(archiveMode !== 'hide');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error || (err as Error)?.message || 'Unknown error';
      console.error('[saveScrapeTasks] Failed:', err);
      alert(`Failed to save scrape tasks: ${msg}`);
    }
  };

  const toggleSelect = (deviceId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(deviceId)) next.delete(deviceId); else next.add(deviceId);
      return next;
    });
  };

  const selectAll = () => {
    const allIds = devices.filter((d) => !d.isArchived).map((d) => d.deviceId);
    setSelectedIds(new Set(allIds));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleAddVps = async () => {
    if (!addIp.trim()) return;
    setAddSaving(true);
    try {
      await api.post('/api/admin/devices/add', {
        ip: addIp.trim(),
        password: addPw,
        pincode: addPin,
        jobs: Number(addJobs) || 3,
      });
      setAddIp(''); setAddPw(''); setAddPin(''); setAddJobs('3');
      setShowAddVps(false);
      fetchDevices(archiveMode !== 'hide');
    } catch { /* noop */ }
    setAddSaving(false);
  };

  const handleBulkPassword = async () => {
    if (!bulkPwValue.trim() || selectedIds.size === 0) return;
    setBulkPwSaving(true);
    try {
      await Promise.all(
        [...selectedIds].map((id) =>
          api.patch(`/api/admin/devices/${id}/vps-password`, { password: bulkPwValue })
        )
      );
      fetchDevices(archiveMode !== 'hide');
      setBulkPwOpen(false);
      setBulkPwValue('');
    } catch { /* noop */ }
    setBulkPwSaving(false);
  };

  if (loading && devices.length === 0) {
    return <Spinner message="Loading devices..." />;
  }

  const s = search.toLowerCase().trim();
  const matchSearch = (d: typeof devices[0]) =>
    !s || (d.nickname || '').toLowerCase().includes(s) || (d.ip || '').includes(s) || (d.hostname || '').toLowerCase().includes(s) || (d.scrapePincode || '').includes(s);

  const isFlagged = (d: typeof devices[0]) =>
    d.status === 'online' && d.recent && (d.recent.records.total < 3000 || d.recent.sessions.total < 100);

  const matchFlag = (d: typeof devices[0]) => !showFlaggedOnly || isFlagged(d);
  const flaggedCount = devices.filter((d) => isFlagged(d)).length;

  const activeDevices = devices.filter((d) => d.status === 'online' && !d.isArchived && matchSearch(d) && matchFlag(d));
  const inactiveDevices = devices.filter((d) => d.status !== 'online' && !d.isArchived && matchSearch(d) && matchFlag(d));
  const archivedDevices = devices.filter((d) => d.isArchived && matchSearch(d));
  const nonArchivedCount = devices.filter((d) => !d.isArchived).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Devices</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {devices.length} total &middot; {activeDevices.length} active &middot; {inactiveDevices.length} inactive
            {archivedDevices.length > 0 && ` · ${archivedDevices.length} archived`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search IP, name, pincode..."
            className="w-48 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 placeholder:text-slate-600"
          />
          {flaggedCount > 0 && (
            <button
              onClick={() => setShowFlaggedOnly(!showFlaggedOnly)}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                showFlaggedOnly
                  ? 'bg-red-600 text-white'
                  : 'bg-red-900/40 text-red-400 border border-red-700/60 hover:bg-red-800/40'
              }`}
            >
              {showFlaggedOnly ? `Flagged (${flaggedCount})` : `${flaggedCount} Flagged`}
            </button>
          )}
          {selectedIds.size > 0 && (
            <>
              <span className="text-xs text-blue-400 font-medium">{selectedIds.size} selected</span>
              <span className="text-slate-700">|</span>
              {onOpenSsh && (
                <button
                  onClick={() => onOpenSsh([...selectedIds])}
                  className="flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-3 py-1.5 rounded-lg transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  SSH
                </button>
              )}
              <button
                onClick={() => { setBulkPwOpen(!bulkPwOpen); setBulkPwValue(''); }}
                className="flex items-center gap-1.5 text-xs bg-orange-600 hover:bg-orange-500 text-white font-medium px-3 py-1.5 rounded-lg transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                Set Password
              </button>
              <span className="text-slate-700">|</span>
            </>
          )}
          <button
            onClick={selectedIds.size === nonArchivedCount ? clearSelection : selectAll}
            className="text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            {selectedIds.size === nonArchivedCount && nonArchivedCount > 0 ? 'Unselect All' : 'Select All'}
          </button>
          <button
            onClick={() => setArchiveMode((m) => m === 'hide' ? 'show' : m === 'show' ? 'only' : 'hide')}
            className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
              archiveMode === 'only'
                ? 'bg-purple-600 text-white border border-purple-500'
                : archiveMode === 'show'
                ? 'bg-purple-900/40 text-purple-300 border border-purple-700/60'
                : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
            }`}
          >
            {archiveMode === 'hide' ? 'Show Archived' : archiveMode === 'show' ? 'Only Archived' : 'Hide Archived'}
          </button>
          <button
            onClick={() => setShowAddVps(!showAddVps)}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
              showAddVps ? 'bg-green-600 text-white' : 'bg-green-700 hover:bg-green-600 text-white'
            }`}
          >
            + Add VPS
          </button>
          <button
            onClick={() => fetchDevices(archiveMode !== 'hide')}
            className="text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Add VPS form */}
      {showAddVps && (
        <div className="bg-slate-900 border border-green-800/50 rounded-xl p-4">
          <h3 className="text-xs font-semibold text-green-400 uppercase tracking-wider mb-3">Add VPS Device</h3>
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="text-[10px] text-slate-500 block mb-1">IP Address *</label>
              <input type="text" value={addIp} onChange={(e) => setAddIp(e.target.value)} placeholder="187.127.146.83"
                className="w-40 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-green-500" />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 block mb-1">Password</label>
              <input type="text" value={addPw} onChange={(e) => setAddPw(e.target.value)} placeholder="VPS password"
                className="w-40 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-green-500" />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 block mb-1">Start Pincode</label>
              <input type="text" value={addPin} onChange={(e) => setAddPin(e.target.value)} placeholder="700001"
                className="w-24 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-green-500" />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 block mb-1">Jobs</label>
              <input type="text" value={addJobs} onChange={(e) => setAddJobs(e.target.value)} placeholder="3"
                className="w-12 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-green-500" />
            </div>
            <button onClick={handleAddVps} disabled={addSaving || !addIp.trim()}
              className="text-xs bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-medium px-4 py-1.5 rounded-lg transition-colors">
              {addSaving ? 'Adding...' : 'Add Device'}
            </button>
            <button onClick={() => setShowAddVps(false)}
              className="text-xs text-slate-400 hover:text-white transition-colors">Cancel</button>
          </div>
          <p className="text-[10px] text-slate-500 mt-2">Device specs (hostname, CPU, RAM) will auto-fill when the scraper starts running.</p>
        </div>
      )}

      {/* Bulk password input */}
      {bulkPwOpen && selectedIds.size > 0 && (
        <div className="bg-slate-900 border border-orange-800/50 rounded-xl p-4 flex items-center gap-3">
          <svg className="w-4 h-4 text-orange-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
          <span className="text-xs text-slate-300 shrink-0">Set password for <span className="text-orange-400 font-semibold">{selectedIds.size}</span> devices:</span>
          <input
            type="text"
            value={bulkPwValue}
            onChange={(e) => setBulkPwValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleBulkPassword(); }}
            placeholder="Enter VPS password..."
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white font-mono focus:outline-none focus:border-orange-500"
            autoFocus
          />
          <button
            onClick={handleBulkPassword}
            disabled={bulkPwSaving || !bulkPwValue.trim()}
            className="text-xs bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-medium px-4 py-1.5 rounded-lg transition-colors shrink-0"
          >
            {bulkPwSaving ? 'Saving...' : 'Save All'}
          </button>
          <button
            onClick={() => { setBulkPwOpen(false); setBulkPwValue(''); }}
            className="text-xs text-slate-400 hover:text-white transition-colors shrink-0"
          >
            Cancel
          </button>
        </div>
      )}

      {devices.length === 0 ? (
        <p className="text-sm text-slate-500 py-16 text-center">No devices registered yet.</p>
      ) : (
        <>
          {/* Active Devices */}
          {archiveMode !== 'only' && activeDevices.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-green-400 uppercase tracking-wider mb-3">
                Active ({activeDevices.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {activeDevices.map((device) => (
                  <DeviceCard
                    key={device.deviceId}
                    device={device}
                    onClick={onDeviceClick}
                    onSavePassword={handleSavePassword}
                    onSaveScrapeConfig={handleSaveScrapeConfig}
                    onSaveScrapeTasks={handleSaveScrapeTasks}
                    selectable
                    selected={selectedIds.has(device.deviceId)}
                    onSelect={toggleSelect}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Inactive Devices */}
          {archiveMode !== 'only' && inactiveDevices.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">
                Inactive ({inactiveDevices.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {inactiveDevices.map((device) => (
                  <DeviceCard
                    key={device.deviceId}
                    device={device}
                    onClick={onDeviceClick}
                    onArchive={handleArchive}
                    onSavePassword={handleSavePassword}
                    onSaveScrapeConfig={handleSaveScrapeConfig}
                    onSaveScrapeTasks={handleSaveScrapeTasks}
                    selectable
                    selected={selectedIds.has(device.deviceId)}
                    onSelect={toggleSelect}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Archived Devices */}
          {archiveMode !== 'hide' && archivedDevices.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-purple-400 uppercase tracking-wider mb-3">
                Archived ({archivedDevices.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {archivedDevices.map((device) => (
                  <DeviceCard
                    key={device.deviceId}
                    device={device}
                    onClick={onDeviceClick}
                    onArchive={handleArchive}
                    onSavePassword={handleSavePassword}
                    onSaveScrapeConfig={handleSaveScrapeConfig}
                    onSaveScrapeTasks={handleSaveScrapeTasks}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default DevicesPage;
