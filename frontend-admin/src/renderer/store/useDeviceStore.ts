import { create } from 'zustand';
import api from '../lib/api';
import type { DeviceInfo, DeviceHistoryDay, SessionStatsRecord, ScrapeJob, StatSnapshot } from '../../shared/types';

// Discriminates "page is in a bad state" from "device truly doesn't exist".
// Without this the UI shows "Device not found" for every failure mode
// (network error, backend down, 404, empty id) which is misleading.
export type DeviceDetailError =
  | { kind: 'not-found' }
  | { kind: 'network'; message: string }
  | { kind: 'no-device-id' };

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
  detailError: DeviceDetailError | null;

  fetchDevices: (includeArchived?: boolean) => Promise<void>;
  fetchDeviceDetail: (deviceId: string, sessionPage?: number, jobPage?: number) => Promise<void>;
  fetchDeviceSessions: (deviceId: string, page: number) => Promise<void>;
  fetchDeviceJobs: (deviceId: string, page: number) => Promise<void>;
  updateLiveStats: (deviceId: string, stat: StatSnapshot) => void;
  clearDeviceDetail: () => void;
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
  detailError: null,

  fetchDevices: async (includeArchived = false) => {
    set({ loading: true });
    try {
      const res = await api.get('/api/admin/devices', {
        params: includeArchived ? { includeArchived: 'true' } : {},
      });
      set({ devices: res.data, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  fetchDeviceDetail: async (deviceId, sessionPage = 1, jobPage = 1) => {
    if (!deviceId) {
      set({
        loading: false,
        detailError: { kind: 'no-device-id' },
        selectedDevice: null,
        deviceSessions: [], deviceJobs: [], deviceHistory: [],
        totalSessions: 0, totalJobs: 0,
      });
      return;
    }

    // Hydrate from the devices list so the user sees nickname/IP/specs while
    // the detail request is still flying. Avoids the flash of "Device not
    // found" between mount and response.
    const cached = get().devices.find((d) => d.deviceId === deviceId) || null;
    set({
      loading: true,
      detailError: null,
      // Only swap if we don't already have the right detail; preserves
      // previous selectedDevice while refreshing.
      selectedDevice: cached || get().selectedDevice?.deviceId === deviceId
        ? (cached || get().selectedDevice)
        : null,
    });

    const { sessionLimit, jobLimit } = get();
    try {
      const res = await api.get(`/api/admin/devices/${deviceId}`, {
        params: { sessionPage, sessionLimit, jobPage, jobLimit },
      });
      set({
        selectedDevice: res.data.device,
        deviceSessions: res.data.sessions || [],
        deviceJobs: res.data.jobs || [],
        deviceHistory: res.data.history || [],
        totalSessions: res.data.totalSessions ?? (res.data.sessions?.length || 0),
        totalJobs: res.data.totalJobs ?? (res.data.jobs?.length || 0),
        sessionPage,
        jobPage,
        loading: false,
        detailError: null,
      });
    } catch (err) {
      const e = err as { response?: { status?: number; data?: { error?: string } }; message?: string };
      const status = e.response?.status;
      console.error('[useDeviceStore.fetchDeviceDetail]', { deviceId, status, message: e.message });
      const detailError: DeviceDetailError = status === 404
        ? { kind: 'not-found' }
        : { kind: 'network', message: e.response?.data?.error || e.message || 'Failed to load device' };
      set({ loading: false, detailError });
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

  clearDeviceDetail: () => set({
    selectedDevice: null,
    deviceSessions: [],
    deviceJobs: [],
    deviceHistory: [],
    totalSessions: 0,
    totalJobs: 0,
    detailError: null,
  }),
}));
