import { create } from 'zustand';
import api from '../lib/api';
import type { DeviceInfo, DeviceHistoryDay, SessionStatsRecord, ScrapeJob, StatSnapshot } from '../../shared/types';

interface DeviceStore {
  devices: DeviceInfo[];
  selectedDevice: DeviceInfo | null;
  deviceSessions: SessionStatsRecord[];
  deviceJobs: ScrapeJob[];
  deviceHistory: DeviceHistoryDay[];
  loading: boolean;

  fetchDevices: () => Promise<void>;
  fetchDeviceDetail: (deviceId: string) => Promise<void>;
  updateLiveStats: (deviceId: string, stat: StatSnapshot) => void;
}

export const useDeviceStore = create<DeviceStore>((set) => ({
  devices: [],
  selectedDevice: null,
  deviceSessions: [],
  deviceJobs: [],
  deviceHistory: [],
  loading: false,

  fetchDevices: async () => {
    set({ loading: true });
    try {
      const res = await api.get('/api/admin/devices');
      set({ devices: res.data, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  fetchDeviceDetail: async (deviceId) => {
    set({ loading: true });
    try {
      const res = await api.get(`/api/admin/devices/${deviceId}`);
      set({
        selectedDevice: res.data.device,
        deviceSessions: res.data.sessions,
        deviceJobs: res.data.jobs,
        deviceHistory: res.data.history,
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },

  updateLiveStats: (deviceId, stat) => {
    set((state) => ({
      devices: state.devices.map((d) =>
        d.deviceId === deviceId ? { ...d, latestStats: stat } : d
      ),
      selectedDevice:
        state.selectedDevice?.deviceId === deviceId
          ? { ...state.selectedDevice, latestStats: stat }
          : state.selectedDevice,
    }));
  },
}));
