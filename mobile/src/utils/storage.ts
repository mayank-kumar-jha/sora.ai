import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const SERVER_IP_KEY = 'server_ip';
const SERVER_URL_KEY = 'server_url';

export const saveTokens = async (accessToken: string, refreshToken: string) => {
    if (Platform.OS === 'web') {
        localStorage.setItem(TOKEN_KEY, accessToken);
        localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    } else {
        await SecureStore.setItemAsync(TOKEN_KEY, accessToken);
        await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
    }
};

export const getAccessToken = async () => {
    if (Platform.OS === 'web') {
        return localStorage.getItem(TOKEN_KEY);
    }
    return await SecureStore.getItemAsync(TOKEN_KEY);
};

export const getRefreshToken = async () => {
    if (Platform.OS === 'web') {
        return localStorage.getItem(REFRESH_TOKEN_KEY);
    }
    return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
};

export const clearTokens = async () => {
    if (Platform.OS === 'web') {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
    } else {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
        await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    }
};

export const saveServerIp = async (ip: string) => {
    if (Platform.OS === 'web') {
        localStorage.setItem(SERVER_IP_KEY, ip);
    } else {
        await SecureStore.setItemAsync(SERVER_IP_KEY, ip);
    }
};

export const getServerIp = async () => {
    if (Platform.OS === 'web') {
        return localStorage.getItem(SERVER_IP_KEY);
    }
    return await SecureStore.getItemAsync(SERVER_IP_KEY);
};

export const saveServerUrl = async (url: string) => {
    if (Platform.OS === 'web') {
        localStorage.setItem(SERVER_URL_KEY, url);
    } else {
        await SecureStore.setItemAsync(SERVER_URL_KEY, url);
    }
};

export const getServerUrl = async () => {
    if (Platform.OS === 'web') {
        return localStorage.getItem(SERVER_URL_KEY);
    }
    return await SecureStore.getItemAsync(SERVER_URL_KEY);
};
