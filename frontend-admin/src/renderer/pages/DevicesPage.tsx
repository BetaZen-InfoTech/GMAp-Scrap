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
  const [showArchived, setShowArchived] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkPwOpen, setBulkPwOpen] = useState(false);
  const [bulkPwValue, setBulkPwValue] = useState('');
  const [bulkPwSaving, setBulkPwSaving] = useState(false);

  useEffect(() => {
    fetchDevices(showArchived);
    const interval = setInterval(() => fetchDevices(showArchived), 30000);
    return () => clearInterval(interval);
  }, [showArchived]);

  const handleArchive = async (deviceId: string) => {
    try {
      await api.patch(`/api/admin/devices/${deviceId}/archive`);
      fetchDevices(showArchived);
    } catch { /* noop */ }
  };

  const handleSavePassword = async (deviceId: string, password: string) => {
    try {
      await api.patch(`/api/admin/devices/${deviceId}/vps-password`, { password });
      fetchDevices(showArchived);
    } catch { /* noop */ }
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

  const handleBulkPassword = async () => {
    if (!bulkPwValue.trim() || selectedIds.size === 0) return;
    setBulkPwSaving(true);
    try {
      await Promise.all(
        [...selectedIds].map((id) =>
          api.patch(`/api/admin/devices/${id}/vps-password`, { password: bulkPwValue })
        )
      );
      fetchDevices(showArchived);
      setBulkPwOpen(false);
      setBulkPwValue('');
    } catch { /* noop */ }
    setBulkPwSaving(false);
  };

  if (loading && devices.length === 0) {
    return <Spinner message="Loading devices..." />;
  }

  const activeDevices = devices.filter((d) => d.status === 'online' && !d.isArchived);
  const inactiveDevices = devices.filter((d) => d.status !== 'online' && !d.isArchived);
  const archivedDevices = devices.filter((d) => d.isArchived);

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
          {selectedIds.size > 0 && (
            <>
              <span className="text-xs text-blue-400 font-medium">{selectedIds.size} selected</span>
              <button onClick={clearSelection} className="text-[10px] text-slate-400 hover:text-white transition-colors">Clear</button>
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
            </>
          )}
          {selectedIds.size === 0 && (
            <button onClick={selectAll} className="text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors">
              Select All
            </button>
          )}
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
              showArchived
                ? 'bg-purple-900/40 text-purple-300 border border-purple-700/60'
                : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
            }`}
          >
            {showArchived ? 'Hide Archived' : 'Show Archived'}
          </button>
          <button
            onClick={() => fetchDevices(showArchived)}
            className="text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

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
          {activeDevices.length > 0 && (
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
                    selectable
                    selected={selectedIds.has(device.deviceId)}
                    onSelect={toggleSelect}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Inactive Devices */}
          {inactiveDevices.length > 0 && (
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
                    selectable
                    selected={selectedIds.has(device.deviceId)}
                    onSelect={toggleSelect}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Archived Devices */}
          {showArchived && archivedDevices.length > 0 && (
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
