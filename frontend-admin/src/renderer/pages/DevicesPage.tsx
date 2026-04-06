import React, { useEffect, useState } from 'react';
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
          {selectedIds.size > 0 && onOpenSsh && (
            <button
              onClick={() => onOpenSsh([...selectedIds])}
              className="flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-3 py-1.5 rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              SSH ({selectedIds.size})
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
