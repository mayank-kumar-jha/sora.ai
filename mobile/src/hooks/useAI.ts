import { useState, useCallback } from 'react';
import { Platform, Linking, Alert, DeviceEventEmitter } from 'react-native';
import apiClient from '../api/client';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Persona/Tone system prefixes ─────────────────────────────────────────────
const PERSONA_PREFIXES: Record<string, string> = {
    assistant: '[PERSONA: Professional assistant. Be formal, efficient, and concise.]',
    friend: '[PERSONA: Best friend. Be warm, casual, and use natural language with occasional emojis.]',
    mentor: '[PERSONA: Wise mentor. Be thoughtful, encourage the user, and give context.]',
    sarcastic: '[PERSONA: Witty and slightly sarcastic assistant. Use clever humor but stay helpful.]',
};

const TONE_PREFIXES: Record<string, string> = {
    concise: '[TONE: Reply in 1-2 sentences max. Be extremely brief.]',
    balanced: '[TONE: Use natural conversational length. Not too long, not too short.]',
    detailed: '[TONE: Provide thorough explanations with context and examples.]',
};

const getSettingsPrefix = async (): Promise<string> => {
    try {
        const [persona, tone] = await Promise.all([
            AsyncStorage.getItem('sora_persona'),
            AsyncStorage.getItem('sora_tone'),
        ]);
        const personaStr = PERSONA_PREFIXES[persona || 'assistant'] || '';
        const toneStr = TONE_PREFIXES[tone || 'balanced'] || '';
        if (!personaStr && !toneStr) return '';
        return `${personaStr} ${toneStr}\n`;
    } catch {
        return '';
    }
};

// Handle client-side actions (call, open app)
const handleClientAction = async (result: any) => {
    if (!result?.clientAction) return;

    if (result.clientAction === 'MAKE_CALL') {
        const contactName = result.contactName;
        if (Platform.OS === 'web') {
            return; // Can't make calls from web
        }

        try {
            const Contacts = require('expo-contacts');
            const { status } = await Contacts.requestPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission needed', 'Contacts permission is required to make calls.');
                return;
            }

            // Search contacts by name
            const { data } = await Contacts.getContactsAsync({
                name: contactName,
                fields: [Contacts.Fields.PhoneNumbers],
            });

            if (data.length > 0 && data[0].phoneNumbers && data[0].phoneNumbers.length > 0) {
                const phoneNumber = data[0].phoneNumbers[0].number;
                const cleanNumber = phoneNumber.replace(/[^0-9+]/g, '');
                Linking.openURL(`tel:${cleanNumber}`);
            } else {
                Alert.alert('Contact not found', `Could not find "${contactName}" in your contacts.`);
            }
        } catch (err) {
            console.error('Call error:', err);
            Alert.alert('Error', 'Failed to initiate call.');
        }
    }

    if (result.clientAction === 'SEND_WHATSAPP') {
        const contactName = result.to;
        let targetPhone = contactName;

        if (Platform.OS !== 'web') {
            try {
                const Contacts = require('expo-contacts');
                const { status } = await Contacts.requestPermissionsAsync();
                if (status === 'granted') {
                    const { data } = await Contacts.getContactsAsync({
                        name: contactName,
                        fields: [Contacts.Fields.PhoneNumbers],
                    });

                    if (data.length > 0 && data[0].phoneNumbers && data[0].phoneNumbers.length > 0) {
                        targetPhone = data[0].phoneNumbers[0].number.replace(/[^0-9+]/g, '');
                    }
                }
            } catch (err) {
                console.error('Contact search error:', err);
            }
        }

        try {
            await apiClient.post('/whatsapp/send', {
                to: targetPhone,
                message: result.messageContent
            });
        } catch (err) {
            console.error('Failed to send WhatsApp message from client action:', err);
            Alert.alert('Error', 'Failed to send WhatsApp message via background service.');
        }
    }

    if (result.clientAction === 'OPEN_APP') {
        const appName = result.appName?.toLowerCase();
        const appSchemes: Record<string, string> = {
            'whatsapp': 'whatsapp://',
            'instagram': 'instagram://',
            'youtube': 'youtube://',
            'spotify': 'spotify://',
            'twitter': 'twitter://',
            'x': 'twitter://',
            'maps': Platform.OS === 'android' ? 'geo:0,0' : 'maps://',
            'camera': Platform.OS === 'android' ? 'intent:#Intent;action=android.media.action.IMAGE_CAPTURE;end' : 'camera://',
            'settings': Platform.OS === 'android' ? 'android.settings.SETTINGS' : 'app-settings:',
            'chrome': 'googlechrome://',
            'gmail': 'googlegmail://',
            'telegram': 'tg://',
            'facebook': 'fb://',
            'snapchat': 'snapchat://',
        };

        const scheme = appSchemes[appName] || `${appName}://`;

        try {
            // Modern OS (Android 11+/iOS 9+) blocks `canOpenURL` due to package visibility rules.
            // Bypassing the check and forcing the intent outright.
            await Linking.openURL(scheme);
        } catch (err) {
            console.warn(`Direct linking to ${scheme} failed, trying browser fallback.`, err);
            Alert.alert(
                'Action Failed',
                `Could not open "${result.appName}". It may not be installed or the OS blocked the system intent.`
            );
        }
    }

    if (result.clientAction === 'OPEN_URL') {
        let url = result.url;
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = `https://${url}`;
        }

        try {
            await Linking.openURL(url);
        } catch (err) {
            console.error('Failed to open URL:', err);
            Alert.alert('Error', `Could not navigate to ${url}`);
        }
    }

    if (result.clientAction === 'PLAY_MUSIC') {
        const songName = result.songName;
        // Search YouTube aggressively
        const query = encodeURIComponent(songName);
        const ytAppScheme = `youtube://results?search_query=${query}`;
        const ytWebUrl = `https://www.youtube.com/results?search_query=${query}`;

        try {
            // Force the app intent first
            await Linking.openURL(ytAppScheme);
        } catch (appErr) {
            // Fallback to web browser instantly if the YouTube app intent strictly fails
            try {
                await Linking.openURL(ytWebUrl);
            } catch (webErr) {
                Alert.alert('Error', `Could not play music. YouTube intent blocked.`);
            }
        }
    }

    if (result.clientAction === 'SET_ALARM') {
        try {
            const targetTime = new Date(result.time);
            const now = new Date();
            const delayMs = targetTime.getTime() - now.getTime();

            if (delayMs <= 0) {
                Alert.alert('Alarm Error', 'The alarm time is in the past. Please try again.');
                return;
            }

            const label = result.label || 'Sora Alarm';
            const hour = targetTime.getHours();
            const minute = targetTime.getMinutes();

            if (Platform.OS === 'android') {
                const { NativeModules } = require('react-native');
                if (NativeModules.SoraOverlay) {
                    NativeModules.SoraOverlay.setAlarm(hour, minute, label);
                    Alert.alert(
                        '⏰ Alarm Set',
                        `Native system alarm set for ${targetTime.toLocaleTimeString()} (${label}).`
                    );
                } else {
                    throw new Error('Native SoraOverlay module not found');
                }
            } else {
                // Fallback for iOS/other (Expo Notifications)
                const Notifications = require('expo-notifications');
                await Notifications.scheduleNotificationAsync({
                    content: { title: '⏰ Sora Alarm', body: label, sound: true },
                    trigger: { date: targetTime },
                });
                Alert.alert('⏰ Alarm Set', `Alarm set for ${targetTime.toLocaleTimeString()}.`);
            }
        } catch (err) {
            console.error('Alarm error:', err);
            Alert.alert('Error', 'Failed to set system alarm.');
        }
    }
};

export const useAI = () => {
    const [messages, setMessages] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const sendMessage = useCallback(async (text: string) => {
        setMessages(prev => [...prev, { role: 'user', content: text }]);
        setLoading(true);

        try {
            // Prepend persona/tone settings as invisible system context
            const prefix = await getSettingsPrefix();
            const messageWithSettings = text.startsWith('[SYSTEM:') || text.startsWith('[PERSONA:')
                ? text  // Don't double-prefix system messages
                : `${prefix}${text}`;

            const response = await apiClient.post('/ai/message', { message: messageWithSettings });
            const data = response.data.data;

            // Handle the new Smart Router format (with thought and message)
            const aiMessage = data.message || data.result?.message || 'Action executed';
            const thought = data.thought || data.result?.thought;

            if (thought) {
                console.log('[Sora Thought]:', thought);
            }

            // Check for client-side actions
            const clientResult = data.result?.clientAction ? data.result : (data.clientAction ? data : null);

            if (clientResult) {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: aiMessage
                }]);
                await handleClientAction(clientResult);
            } else {
                setMessages(prev => [...prev, { role: 'assistant', content: aiMessage }]);
            }
        } catch (err) {
            console.error('AI Error', err);
            setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I hit a snag while processing that.' }]);
        } finally {
            setLoading(false);
        }
    }, []);

    return { messages, sendMessage, loading };
};
