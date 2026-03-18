import axios, { AxiosError } from 'axios';
import { ScrapedRecord, AppSettings } from '../shared/types';
import { logApiCall } from './apiLogger';
import { getApiBaseUrl } from './config';

const RETRY_DELAYS = [1000, 2000, 4000];

export interface BatchSendResult {
  success: boolean;
  batchNumber: number;
  count: number;
  duplicateCount?: number;
  insertedIds?: string[];
  duplicateIds?: string[];
  error?: string;
}

/**
 * Resolve the batch endpoint:
 * - If apiEndpoint1 is configured, use it (user's custom endpoint)
 * - Otherwise, auto-use the backend API at /api/scraped-data/batch
 */
function getBatchEndpoint(settings: AppSettings): string {
  if (settings.apiEndpoint1) return settings.apiEndpoint1;
  return `${getApiBaseUrl()}/api/scraped-data/batch`;
}

export async function sendBatch(
  records: ScrapedRecord[],
  batchNumber: number,
  settings: AppSettings,
  sessionId: string,
  keyword?: string,
  pincode?: string | number,
  scrapCategory?: string,
  scrapSubCategory?: string,
  round?: number,
): Promise<BatchSendResult> {
  const endpoint = getBatchEndpoint(settings);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...settings.apiHeaders1,
  };

  if (settings.apiAuthToken) {
    headers['Authorization'] = `Bearer ${settings.apiAuthToken}`;
  }

  const payload = {
    batchNumber,
    timestamp: new Date().toISOString(),
    sessionId,
    deviceId: settings.deviceId || undefined,
    count: records.length,
    pincode: pincode != null ? String(pincode) : undefined,
    keyword: keyword || undefined,
    scrapCategory: scrapCategory || undefined,
    scrapSubCategory: scrapSubCategory || undefined,
    round: round || undefined,
    scrapFrom: 'G-Map',
    records,
  };

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    const t0 = Date.now();
    try {
      const res = await axios.post(endpoint, payload, { headers, timeout: 30000 });
      logApiCall({
        timestamp: new Date().toISOString(),
        type: 'batch',
        sessionId,
        keyword,
        endpoint,
        attempt: attempt + 1,
        statusCode: res.status,
        responseTimeMs: Date.now() - t0,
        success: true,
        recordCount: records.length,
      });
      return {
        success: true,
        batchNumber,
        count: res.data?.count ?? records.length,
        duplicateCount: res.data?.duplicateCount ?? 0,
        insertedIds: res.data?.insertedIds ?? [],
        duplicateIds: res.data?.duplicateIds ?? [],
      };
    } catch (err: unknown) {
      const isLast = attempt === RETRY_DELAYS.length;
      const axiosErr = err instanceof AxiosError ? err : null;
      const message = axiosErr
        ? `HTTP ${axiosErr.response?.status}: ${axiosErr.response?.statusText || axiosErr.message}`
        : (err instanceof Error ? err.message : String(err));

      logApiCall({
        timestamp: new Date().toISOString(),
        type: 'batch',
        sessionId,
        keyword,
        endpoint,
        attempt: attempt + 1,
        statusCode: axiosErr?.response?.status,
        responseTimeMs: Date.now() - t0,
        success: false,
        error: message,
        recordCount: records.length,
      });

      if (isLast) {
        return { success: false, batchNumber, count: records.length, error: message };
      }

      await delay(RETRY_DELAYS[attempt]);
    }
  }

  return { success: false, batchNumber, count: records.length, error: 'Max retries reached' };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
