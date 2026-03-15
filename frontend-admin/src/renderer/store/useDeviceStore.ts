import { create } from 'zustand';
import api from '../lib/api';
import type { DeviceInfo, DeviceHistoryDay, SessionStatsRecord, ScrapeJob, StatSnapshot } from '../../shared/types';

interface DeviceStore {
  devices: DeviceInfo[];
  selectedDevice: DeviceInfo | null;
  deviceSessions: SessionStatsRecord[];
  deviceJobs: ScrapeJob[];
  deviceHistory: DeviceHistoryDay[];
  totalSessions: number;
  totalJobs: number;
  sessionPage: number;
  sessionLimit: number;
  jobPage: number;
  jobLimit: number;
  loading: boolean;

  fetchDevices: () => Promise<void>;
  fetchDeviceDetail: (deviceId: string, sessionPage?: number, jobPage?: number) => Promise<void>;
  fetchDeviceSessions: (deviceId: string, page: number) => Promise<void>;
  fetchDeviceJobs: (deviceId: string, page: number) => Promise<void>;
  updateLiveStats: (deviceId: string, stat: StatSnapshot) => void;
}

export const useDeviceStore = create<DeviceStore>((set, get) => ({
  devices: [],
  selectedDevice: null,
  deviceSessions: [],
  deviceJobs: [],
  deviceHistory: [],
  totalSessions: 0,
  totalJobs: 0,
  sessionPage: 1,
  sessionLimit: 50,
  jobPage: 1,
  jobLimit: 50,
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

  fetchDeviceDetail: async (deviceId, sessionPage = 1, jobPage = 1) => {
    set({ loading: true });
    const { sessionLimit, jobLimit } = get();
    try {
      const res = await api.get(`/api/admin/devices/${deviceId}`, {
        params: { sessionPage, sessionLimit, jobPage, jobLimit },
      });
      set({
        selectedDevice: res.data.device,
        deviceSessions: res.data.sessions,
        deviceJobs: res.data.jobs,
        deviceHistory: res.data.history,
        totalSessions: res.data.totalSessions ?? res.data.sessions.length,
        totalJobs: res.data.totalJobs ?? res.data.jobs.length,
        sessionPage,
        jobPage,
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },

  fetchDeviceSessions: async (deviceId, page) => {
    const { sessionLimit } = get();
    try {
      const res = await api.get(`/api/admin/devices/${deviceId}`, {
        params: { sessionPage: page, sessionLimit, jobPage: 1, jobLimit: 1 },
      });
      set({
        deviceSessions: res.data.sessions,
        totalSessions: res.data.totalSessions ?? res.data.sessions.length,
        sessionPage: page,
      });
    } catch { /* noop */ }
  },

  fetchDeviceJobs: async (deviceId, page) => {
    const { jobLimit } = get();
    try {
      const res = await api.get(`/api/admin/devices/${deviceId}`, {
        params: { sessionPage: 1, sessionLimit: 1, jobPage: page, jobLimit },
      });
      set({
        deviceJobs: res.data.jobs,
        totalJobs: res.data.totalJobs ?? res.data.jobs.length,
        jobPage: page,
      });
    } catch { /* noop */ }
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
