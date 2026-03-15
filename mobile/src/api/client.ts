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
    const customUrl = await getServerUrl();
    if (customUrl && Platform.OS !== 'web') {
        const base = customUrl.startsWith('http') ? customUrl : `http://${customUrl}:3000`;
        config.baseURL = `${base}/api`;
    }

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
            isRefreshing = true;

            try {
                const refreshToken = await getRefreshToken();

                if (!refreshToken) {
                    isRefreshing = false;
                    await clearTokens();
                    return Promise.reject(error);
                }

                const response = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
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
