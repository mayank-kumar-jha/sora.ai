import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Link } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { getServerUrl, saveServerUrl } from '../utils/storage';
import { DEFAULT_BASE_URL } from '../constants/settings';

export default function LoginScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [serverUrl, setServerUrl] = useState(DEFAULT_BASE_URL);
    const [showSettings, setShowSettings] = useState(false);
    const { login } = useAuth();

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        const storedUrl = await getServerUrl();
        if (storedUrl) setServerUrl(storedUrl);
    };

    const handleLogin = async () => {
        if (!email || !password) return;
        setLoading(true);
        try {
            await saveServerUrl(serverUrl);
            await login(email, password);
        } catch (err: any) {
            console.error('Login Error:', err);
            let msg = 'Login failed. ';
            
            if (err.message === 'Network Error') {
                msg += `Cannot reach the server at ${serverUrl}. \n\nPlease check your internet connection or server status.`;
            } else {
                msg += err.response?.data?.message || err.message || 'Unknown error';
            }
            alert(msg);
        } finally {
            setLoading(false);
        }
    };

    const resetUrl = () => setServerUrl(DEFAULT_BASE_URL);

    return (
        <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}
        >
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <Text style={styles.title}>Super AI Assistant</Text>
                
                <TextInput
                    style={styles.input}
                    placeholder="Email"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                />
                <TextInput
                    style={styles.input}
                    placeholder="Password"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                />
                
                <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
                    {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Login</Text>}
                </TouchableOpacity>

                <TouchableOpacity 
                    style={styles.settingsToggle} 
                    onPress={() => setShowSettings(!showSettings)}
                >
                    <Text style={styles.settingsToggleText}>
                        {showSettings ? 'Hide Server Settings' : 'Advanced: Server Settings'}
                    </Text>
                </TouchableOpacity>

                {showSettings && (
                    <View style={styles.settingsContainer}>
                        <Text style={styles.settingsLabel}>Backend Server URL:</Text>
                        <TextInput
                            style={[styles.input, styles.settingsInput]}
                            placeholder="https://your-app.onrender.com"
                            value={serverUrl}
                            onChangeText={setServerUrl}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                        <TouchableOpacity style={styles.resetButton} onPress={resetUrl}>
                            <Text style={styles.resetButtonText}>Reset to Default</Text>
                        </TouchableOpacity>
                        <Text style={styles.settingsHint}>
                            Paste your production URL or internal IP.
                        </Text>
                    </View>
                )}

                <Link href="/register" asChild>
                    <TouchableOpacity>
                        <Text style={styles.linkText}>Don't have an account? Register</Text>
                    </TouchableOpacity>
                </Link>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 20 },
    title: { fontSize: 28, fontWeight: 'bold', marginBottom: 40, textAlign: 'center', color: '#1a1a1a' },
    input: { borderWidth: 1, borderColor: '#eee', padding: 15, borderRadius: 12, marginBottom: 15, fontSize: 16, backgroundColor: '#f9f9f9' },
    button: { backgroundColor: '#007AFF', padding: 18, borderRadius: 12, alignItems: 'center', shadowColor: '#007AFF', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 5 },
    buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
    linkText: { color: '#007AFF', marginTop: 25, textAlign: 'center', fontSize: 15 },
    settingsToggle: { marginTop: 30, padding: 10 },
    settingsToggleText: { color: '#666', textAlign: 'center', fontSize: 14, textDecorationLine: 'underline' },
    settingsContainer: { marginTop: 10, padding: 15, backgroundColor: '#f0f0f0', borderRadius: 12 },
    settingsLabel: { fontSize: 14, fontWeight: 'bold', color: '#444', marginBottom: 8 },
    settingsInput: { backgroundColor: '#fff', marginBottom: 5 },
    settingsHint: { fontSize: 12, color: '#888', fontStyle: 'italic' },
    resetButton: { paddingVertical: 8, alignSelf: 'flex-start', marginBottom: 10 },
    resetButtonText: { color: '#007AFF', fontSize: 13, fontWeight: '600' }
});
