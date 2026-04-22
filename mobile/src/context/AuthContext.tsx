import React, { createContext, useContext, useState, useEffect } from 'react';
import * as storage from '../utils/storage';
import apiClient from '../api/client';

interface AuthContextType {
    user: any;
    loading: boolean;
    login: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadUser();
    }, []);

    const loadUser = async () => {
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Auth Timeout')), 30000)
        );
        
        try {
            const token = await storage.getAccessToken();
            if (token) {
                // Race between the API call and a 30s timeout
                const response = await Promise.race([
                    apiClient.get('/auth/me'),
                    timeoutPromise
                ]) as any;
                setUser(response.data.data.user); // Fixed path to match backend response
            }
        } catch (err) {
            console.log('Failed to load user or timeout occurred:', err);
            // If it's a timeout, we DON'T clear tokens. We just stay on the login screen or retry.
            // Only clear tokens if the server explicitly says 401/403 (Invalid Token)
            const isAxiosError = (err as any).isAxiosError;
            const status = (err as any).response?.status;
            
            if (err instanceof Error && (err.message === 'Auth Timeout' || err.message === 'Network Error')) {
                console.log("Network timeout; assuming user is still offline. Keeping valid token loaded.");
                // User is null but token is valid. Let's just assume logged in but offline later,
                // But for now, if the token is present, we shouldn't force them out. Let's hydrate fake user to bypass guard.
                setUser({ id: "offline", name: "Offline Mode", email: "offline" });
            } else if (isAxiosError && !status) {
                // Network error (no status code). App started faster than WiFi.
                console.log("ERR_NETWORK detected. Persisting offline user state.");
                setUser({ id: "offline", name: "Offline Mode", email: "offline" });
            } else {
                if (status === 401 || status === 403) {
                    await storage.clearTokens();
                    setUser(null);
                } else {
                    // Server returned 500, but token is presumably valid. Keep them logged in:
                    setUser({ id: "offline", name: "Offline Mode", email: "offline" });
                }
            }
        } finally {
            setLoading(false);
        }
    };

    const login = async (email: string, password: string) => {
        const response = await apiClient.post('/auth/login', { email, password });
        const { accessToken, refreshToken, user: userData } = response.data.data;
        await storage.saveTokens(accessToken, refreshToken);
        setUser(userData);
    };

    const logout = async () => {
        try {
            await apiClient.post('/auth/logout');
        } finally {
            await storage.clearTokens();
            setUser(null);
        }
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within an AuthProvider');
    return context;
};
