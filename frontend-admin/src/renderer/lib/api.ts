import axios from 'axios';

let baseUrl = '';
let authToken = '';
let onUnauthorized: (() => void) | null = null;
let initialized = false;

/**
 * Initialize the API base URL from main process config (.env).
 * Must be called before any API requests are made.
 */
export async function initBaseUrl(): Promise<void> {
  if (initialized) return;
  try {
    const url = await window.electronAPI.getApiBaseUrl();
    baseUrl = url;
    api.defaults.baseURL = url;
    initialized = true;
  } catch (err) {
    console.error('[api] Failed to get base URL from main process:', err);
  }
}

export function setBaseUrl(url: string) {
  baseUrl = url;
  api.defaults.baseURL = url;
  initialized = true;
}

export function setAuthToken(token: string) {
  authToken = token;
}

export function getAuthToken(): string {
  return authToken;
}

export function getBaseUrl(): string {
  return baseUrl;
}

export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

const api = axios.create({
  timeout: 30000,
});

// Attach Bearer token to every request
api.interceptors.request.use(async (config) => {
  // Lazy-init base URL if not yet set
  if (!initialized) {
    await initBaseUrl();
  }
  if (!config.baseURL && baseUrl) {
    config.baseURL = baseUrl;
  }
  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});

// Auto-logout on 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      onUnauthorized?.();
    }
    return Promise.reject(error);
  }
);

export default api;
