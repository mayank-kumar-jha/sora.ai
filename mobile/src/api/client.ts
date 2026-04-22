import axios from 'axios';
import { Platform } from 'react-native';
import { getAccessToken, getRefreshToken, saveTokens, clearTokens, getServerUrl } from '../utils/storage';
import { DEFAULT_BASE_URL } from '../constants/settings';

export const API_URL = DEFAULT_BASE_URL + '/api';

export const getDynamicApiUrl = async () => {
    if (Platform.OS === 'web') return '/api';
    const customUrl = await getServerUrl();
    if (customUrl) {
        // If it's a full URL, use it; otherwise assume it's an IP and needs port 3000
        const base = customUrl.startsWith('http') ? customUrl : `http://${customUrl}:3000`;
        return `${base}/api`;
    }
    return API_URL;
};

const apiClient = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

apiClient.interceptors.request.use(async (config) => {
    // Dynamically update baseURL if a custom URL is set, otherwise use DEFAULT_BASE_URL
    let customUrl = await getServerUrl();
    if (customUrl && customUrl.includes('render.com')) {
        customUrl = null; // Auto-fix caching issue where app stubbornly connects to frozen prod server
    }
    
    // Always dynamically resolve the base URL to prevent hot-reload caching issues
    // FORCED FIX: Ignore customUrl completely to ensure it uses the ADB USB tunnel (127.0.0.1)
    const activeUrl = DEFAULT_BASE_URL;
    const base = activeUrl.startsWith('http') ? activeUrl : `http://${activeUrl}:3000`;
    config.baseURL = `${base}/api`;
    console.log('[Axios] Requesting:', config.baseURL, config.url);

    const token = await getAccessToken();
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

const subscribeTokenRefresh = (cb: (token: string) => void) => {
    refreshSubscribers.push(cb);
};

const onRefreshed = (token: string) => {
    refreshSubscribers.map((cb) => cb(token));
    refreshSubscribers = [];
};

apiClient.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        if (error.response?.status === 401 && !originalRequest._retry) {
            if (isRefreshing) {
                return new Promise((resolve) => {
                    subscribeTokenRefresh((token) => {
                        originalRequest.headers.Authorization = `Bearer ${token}`;
                        resolve(apiClient(originalRequest));
                    });
                });
            }

            originalRequest._retry = true;
            try {
                const refreshToken = await getRefreshToken();

                if (!refreshToken) {
                    isRefreshing = false;
                    await clearTokens();
                    return Promise.reject(error);
                }

                // Dynamically resolve base URL for refresh call
                const customUrl = await getServerUrl();
                const base = (customUrl && Platform.OS !== 'web')
                    ? (customUrl.startsWith('http') ? customUrl : `http://${customUrl}:3000`)
                    : DEFAULT_BASE_URL;
                const refreshUrl = `${base}/api/auth/refresh`;

                const response = await axios.post(refreshUrl, { refreshToken });
                const { accessToken, refreshToken: newRefreshToken } = response.data.data;

                await saveTokens(accessToken, newRefreshToken);
                isRefreshing = false;
                onRefreshed(accessToken);

                originalRequest.headers.Authorization = `Bearer ${accessToken}`;
                return apiClient(originalRequest);
            } catch (refreshError) {
                isRefreshing = false;
                await clearTokens();
                return Promise.reject(refreshError);
            }
        }
        return Promise.reject(error);
    }
);

export default apiClient;
