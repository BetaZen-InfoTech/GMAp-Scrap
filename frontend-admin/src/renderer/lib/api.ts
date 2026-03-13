import axios from 'axios';

const PROD_API_URL = 'https://gmap-scrap-backend-api.betazeninfotech.com';

let baseUrl = PROD_API_URL;
let authToken = '';
let onUnauthorized: (() => void) | null = null;

export function setBaseUrl(url: string) {
  baseUrl = url;
  api.defaults.baseURL = url;
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
  baseURL: PROD_API_URL,
  timeout: 30000,
});

// Attach Bearer token to every request
api.interceptors.request.use((config) => {
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
