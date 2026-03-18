import React, { useEffect } from 'react';
import { useDeviceStore } from '../store/useDeviceStore';
import DeviceCard from '../components/DeviceCard';
import Spinner from '../components/Spinner';

interface DevicesPageProps {
  onDeviceClick: (deviceId: string) => void;
}

const DevicesPage: React.FC<DevicesPageProps> = ({ onDeviceClick }) => {
  const { devices, loading, fetchDevices } = useDeviceStore();

  useEffect(() => {
    fetchDevices();
    const interval = setInterval(fetchDevices, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading && devices.length === 0) {
    return <Spinner message="Loading devices..." />;
  }

  const activeDevices = devices.filter((d) => d.status === 'online');
  const inactiveDevices = devices.filter((d) => d.status !== 'online');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Devices</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {devices.length} total &middot; {activeDevices.length} active &middot; {inactiveDevices.length} inactive
          </p>
        </div>
        <button
          onClick={fetchDevices}
          className="text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors"
        >
          Refresh
        </button>
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
                  <DeviceCard key={device.deviceId} device={device} onClick={onDeviceClick} />
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
                  <DeviceCard key={device.deviceId} device={device} onClick={onDeviceClick} />
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
