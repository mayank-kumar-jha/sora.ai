import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { THEMES, VOICES } from '../constants/settings';

export interface SoraSettings {
    theme: string;
    persona: string;
    tone: string;
    eyeColor: string;
    voiceId: string;
}

const defaults: SoraSettings = {
    theme: 'dark_blue',
    persona: 'assistant',
    tone: 'balanced',
    eyeColor: '#4a9eff',
    voiceId: 'EXAVITQu4vr4xnSDxMaL',
};

interface SoraSettingsContextType {
    settings: SoraSettings;
    updateTheme: (id: string) => void;
    updatePersona: (id: string) => void;
    updateTone: (id: string) => void;
    updateVoice: (id: string) => void;
}

const SoraSettingsContext = createContext<SoraSettingsContextType>({
    settings: defaults,
    updateTheme: () => { },
    updatePersona: () => { },
    updateTone: () => { },
    updateVoice: () => { },
});

export function SoraSettingsProvider({ children }: { children: React.ReactNode }) {
    const [settings, setSettings] = useState<SoraSettings>(defaults);

    // Load all settings from storage on mount
    useEffect(() => {
        (async () => {
            const [theme, persona, tone, voice] = await Promise.all([
                AsyncStorage.getItem('sora_theme'),
                AsyncStorage.getItem('sora_persona'),
                AsyncStorage.getItem('sora_tone'),
                AsyncStorage.getItem('sora_voice'),
            ]);
            const foundTheme = THEMES.find(t => t.id === (theme || 'dark_blue'));
            setSettings({
                theme: theme || 'dark_blue',
                persona: persona || 'assistant',
                tone: tone || 'balanced',
                eyeColor: foundTheme?.eyeColor || '#4a9eff',
                voiceId: voice || 'EXAVITQu4vr4xnSDxMaL',
            });
        })();
    }, []);

    // Sync with native overlay
    useEffect(() => {
        if (Platform.OS === 'android') {
            const { NativeModules } = require('react-native');
            if (NativeModules.SoraOverlay) {
                NativeModules.SoraOverlay.updateEyeColor(settings.eyeColor);
            }
        }
    }, [settings.eyeColor]);

    const updateTheme = useCallback((id: string) => {
        AsyncStorage.setItem('sora_theme', id);
        const found = THEMES.find(t => t.id === id);
        setSettings(prev => ({ ...prev, theme: id, eyeColor: found?.eyeColor || '#4a9eff' }));
    }, []);

    const updatePersona = useCallback((id: string) => {
        AsyncStorage.setItem('sora_persona', id);
        setSettings(prev => ({ ...prev, persona: id }));
    }, []);

    const updateTone = useCallback((id: string) => {
        AsyncStorage.setItem('sora_tone', id);
        setSettings(prev => ({ ...prev, tone: id }));
    }, []);

    const updateVoice = useCallback((id: string) => {
        AsyncStorage.setItem('sora_voice', id);
        setSettings(prev => ({ ...prev, voiceId: id }));
    }, []);

    return (
        <SoraSettingsContext.Provider value={{ settings, updateTheme, updatePersona, updateTone, updateVoice }}>
            {children}
        </SoraSettingsContext.Provider>
    );
}

export function useSoraSettings() {
    return useContext(SoraSettingsContext);
}
