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
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadUser();
    }, []);

    const loadUser = async () => {
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Auth Timeout')), 5000)
        );
        
        try {
            const token = await storage.getAccessToken();
            if (token) {
                // Race between the API call and a 5s timeout
                const response = await Promise.race([
                    apiClient.get('/auth/me'),
                    timeoutPromise
                ]) as any;
                setUser(response.data.data);
            }
        } catch (err) {
            console.log('Failed to load user or timeout occurred, proceeding to login', err);
            // If it's a timeout, we don't necessarily clear tokens, just proceed
            if (err instanceof Error && err.message === 'Auth Timeout') {
                setUser(null);
            } else {
                await storage.clearTokens();
                setUser(null);
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
