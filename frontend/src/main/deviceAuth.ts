import axios from 'axios';
import { getSettings, saveSettings } from './store';
import { getApiBaseUrl } from './config';
import { getDeviceInfo } from './deviceInfo';

export async function registerDevice(
  password: string,
  nickname?: string
): Promise<{ success: boolean; error?: string }> {
  const settings = getSettings();
  const baseUrl = getApiBaseUrl(settings);

  try {
    const deviceInfo = getDeviceInfo();
    const response = await axios.post(
      `${baseUrl}/api/devices/register`,
      { password, deviceInfo, nickname: nickname?.trim() || '' },
      { timeout: 10000 }
    );

    if (response.data.success) {
      saveSettings({
        deviceId: response.data.deviceId,
        isRegistered: true,
        nickname: nickname?.trim() || '',
      });
      return { success: true };
    }
    return { success: false, error: response.data.error };
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      const msg =
        err.response?.data?.error ?? err.message ?? 'Connection failed';
      return { success: false, error: msg };
    }
    return { success: false, error: String(err) };
  }
}

export async function verifyDevice(): Promise<{ success: boolean; error?: string }> {
  const settings = getSettings();

  if (!settings.isRegistered || !settings.deviceId) {
    return { success: false, error: 'Device not registered' };
  }

  const baseUrl = getApiBaseUrl(settings);

  try {
    const response = await axios.post(
      `${baseUrl}/api/devices/verify`,
      { deviceId: settings.deviceId },
      { timeout: 10000 }
    );

    if (response.data.success) {
      // Sync nickname from server if available
      if (response.data.nickname !== undefined) {
        saveSettings({ nickname: response.data.nickname });
      }
      return { success: true };
    }
    return { success: false, error: response.data.error };
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      return { success: false, error: err.message ?? 'Connection failed' };
    }
    return { success: false, error: String(err) };
  }
}
