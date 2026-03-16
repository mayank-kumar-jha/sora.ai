import { useState, useCallback, useEffect, useRef } from 'react';
import { Platform, Linking, Alert, DeviceEventEmitter } from 'react-native';
import apiClient from '../api/client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sendWsMessage } from '../services/BackgroundService';

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
        if (Platform.OS === 'web') return;

        try {
            const Contacts = require('expo-contacts');
            const { status } = await Contacts.requestPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission needed', 'Contacts permission is required to make calls.');
                return;
            }

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
            console.error('Failed to send WhatsApp message:', err);
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
            await Linking.openURL(scheme);
        } catch (err) {
            console.warn(`Direct linking to ${scheme} failed.`, err);
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
        }
    }

    if (result.clientAction === 'PLAY_MUSIC') {
        const songName = result.songName;
        const query = encodeURIComponent(songName);
        const ytAppScheme = `youtube://results?search_query=${query}`;
        const ytWebUrl = `https://www.youtube.com/results?search_query=${query}`;
        try {
            await Linking.openURL(ytAppScheme);
        } catch (appErr) {
            try {
                await Linking.openURL(ytWebUrl);
            } catch (webErr) {
                console.error('YouTube failed.');
            }
        }
    }

    if (result.clientAction === 'SET_ALARM') {
        try {
            const targetTime = new Date(result.time);
            const label = result.label || 'Sora Alarm';
            const hour = targetTime.getHours();
            const minute = targetTime.getMinutes();

            if (Platform.OS === 'android') {
                const { NativeModules } = require('react-native');
                if (NativeModules.SoraOverlay) {
                    NativeModules.SoraOverlay.setAlarm(hour, minute, label);
                }
            } else {
                const Notifications = require('expo-notifications');
                await Notifications.scheduleNotificationAsync({
                    content: { title: '⏰ Sora Alarm', body: label, sound: true },
                    trigger: { date: targetTime },
                });
            }
        } catch (err) {
            console.error('Alarm error:', err);
        }
    }
};

export const useAI = (conversationId?: string) => {
    const [messages, setMessages] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);
    const streamBuffer = useRef<string>('');

    useEffect(() => {
        const wsListener = DeviceEventEmitter.addListener('WS_EVENT', (data: any) => {
            if (data.type === 'AI_TOKEN') {
                setIsStreaming(true);
                streamBuffer.current += data.content;
                setMessages(prev => {
                    const newMsgs = [...prev];
                    if (newMsgs.length === 0) return newMsgs;
                    const lastMsg = newMsgs[newMsgs.length - 1];
                    if (lastMsg && lastMsg.role === 'assistant' && !lastMsg.isComplete) {
                        return [...newMsgs.slice(0, -1), { ...lastMsg, content: streamBuffer.current }];
                    } else {
                        return [...newMsgs, { role: 'assistant', content: data.content, isComplete: false }];
                    }
                });
            }

            if (data.type === 'AI_COMPLETE') {
                setIsStreaming(false);
                setLoading(false);
                setMessages(prev => {
                    if (prev.length === 0) return prev;
                    const newMsgs = [...prev];
                    const lastMsg = newMsgs[newMsgs.length - 1];
                    if (lastMsg.role === 'assistant') {
                        lastMsg.isComplete = true;
                    }
                    return newMsgs;
                });
                streamBuffer.current = '';
                
                if (data.result?.clientAction) {
                    handleClientAction(data.result);
                }
            }

            if (data.type === 'AI_THOUGHT') {
                console.log('[Sora Thought]:', data.content);
            }

            if (data.type === 'ERROR') {
                Alert.alert('AI Error', data.message);
                setLoading(false);
            }
        });

        return () => wsListener.remove();
    }, []);

    const sendMessage = useCallback(async (text: string, image?: string) => {
        setMessages(prev => [...prev, { role: 'user', content: text }]);
        setLoading(true);
        streamBuffer.current = '';

        const prefix = await getSettingsPrefix();
        const messageWithSettings = text.startsWith('[SYSTEM:') || text.startsWith('[PERSONA:')
            ? text
            : `${prefix}${text}`;

        const payload = {
            type: 'AI_CHAT',
            payload: {
                message: messageWithSettings,
                context: messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
                image,
                conversationId,
                voiceId: await AsyncStorage.getItem('sora_voice') || 'aura-asteria-en'
            }
        };

        const success = sendWsMessage(payload);
        if (!success) {
            try {
                const response = await apiClient.post('/ai/message', { 
                    message: messageWithSettings, 
                    image,
                    conversationId
                });
                const aiData = response.data.data;
                const aiMessage = aiData.message || aiData.result?.message;
                setMessages(prev => [...prev, { role: 'assistant', content: aiMessage, isComplete: true }]);
                
                const clientResult = aiData.result?.clientAction ? aiData.result : (aiData.clientAction ? aiData : null);
                if (clientResult) handleClientAction(clientResult);
                
                setLoading(false);
            } catch (err) {
                setLoading(false);
                setMessages(prev => [...prev, { role: 'assistant', content: 'Connection lost.' }]);
            }
        }
    }, [messages, conversationId]);

    return { messages, sendMessage, loading, isStreaming };
};
