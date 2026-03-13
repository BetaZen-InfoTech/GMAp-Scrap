import axios, { AxiosError } from 'axios';
import fs from 'fs';
import FormData from 'form-data';
import path from 'path';
import { AppSettings } from '../shared/types';
import { logApiCall } from './apiLogger';
import { getApiBaseUrl } from './config';

const RETRY_DELAYS = [1000, 2000, 4000];

export interface ExcelSendResult {
  success: boolean;
  error?: string;
}

/**
 * Resolve the Excel upload endpoint:
 * - If apiEndpoint2 is configured, use it (user's custom endpoint)
 * - Otherwise, auto-use the backend API at /api/scraped-data/excel
 */
function getExcelEndpoint(settings: AppSettings): string {
  if (settings.apiEndpoint2) return settings.apiEndpoint2;
  return `${getApiBaseUrl()}/api/scraped-data/excel`;
}

export async function sendExcelFile(
  filePath: string,
  sessionId: string,
  keyword: string,
  settings: AppSettings
): Promise<ExcelSendResult> {
  const endpoint = getExcelEndpoint(settings);

  if (!fs.existsSync(filePath)) {
    return { success: false, error: `File not found: ${filePath}` };
  }

  const headers: Record<string, string> = {
    ...settings.apiHeaders2,
  };

  if (settings.apiAuthToken) {
    headers['Authorization'] = `Bearer ${settings.apiAuthToken}`;
  }

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    const t0 = Date.now();
    try {
      const form = new FormData();
      form.append('file', fs.createReadStream(filePath), {
        filename: path.basename(filePath),
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      form.append('sessionId', sessionId);
      form.append('keyword', keyword);
      if (settings.deviceId) {
        form.append('deviceId', settings.deviceId);
      }
      form.append('timestamp', new Date().toISOString());

      const res = await axios.post(endpoint, form, {
        headers: { ...headers, ...form.getHeaders() },
        timeout: 60000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });

      logApiCall({
        timestamp: new Date().toISOString(),
        type: 'excel',
        sessionId,
        keyword,
        endpoint,
        attempt: attempt + 1,
        statusCode: res.status,
        responseTimeMs: Date.now() - t0,
        success: true,
      });

      return { success: true };
    } catch (err: unknown) {
      const isLast = attempt === RETRY_DELAYS.length;
      const axiosErr = err instanceof AxiosError ? err : null;
      const message = axiosErr
        ? `HTTP ${axiosErr.response?.status}: ${axiosErr.response?.statusText || axiosErr.message}`
        : (err instanceof Error ? err.message : String(err));

      logApiCall({
        timestamp: new Date().toISOString(),
        type: 'excel',
        sessionId,
        keyword,
        endpoint,
        attempt: attempt + 1,
        statusCode: axiosErr?.response?.status,
        responseTimeMs: Date.now() - t0,
        success: false,
        error: message,
      });

      if (isLast) {
        return { success: false, error: message };
      }

      await delay(RETRY_DELAYS[attempt]);
    }
  }

  return { success: false, error: 'Max retries reached' };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
