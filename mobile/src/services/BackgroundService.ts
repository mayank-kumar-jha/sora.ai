import { Platform, DeviceEventEmitter, AppState } from 'react-native';
import { getAccessToken, getServerUrl } from '../utils/storage';
import { OverlayBridge } from '../native/OverlayBridge';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import * as FileSystem from 'expo-file-system';
import apiClient from '../api/client';
import { Buffer } from 'buffer';
import { DEFAULT_BASE_URL } from '../constants/settings';

const silenceAsset = require('../assets/silence.mp3');

let ws: WebSocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let backgroundSound: Audio.Sound | null = null;
let lastMessageSound: Audio.Sound | null = null;
let isConnecting = false;

export const speakText = async (text: string) => {
    try {
        OverlayBridge.updateState('Speaking');
        OverlayBridge.addMessage(text, 'ai');
        try {
            console.log('[BackgroundService] Synthesizing voice...');
            const response = await apiClient.post('/voice/synthesize', { text }, { responseType: 'arraybuffer' });

            const base64 = Platform.OS === 'web'
                ? btoa(new Uint8Array(response.data).reduce((s, b) => s + String.fromCharCode(b), ''))
                : Buffer.from(response.data, 'binary').toString('base64');

            const audioUri = `data:audio/mpeg;base64,${base64}`;

            // Clean up old sound if still playing
            if (lastMessageSound) {
                try {
                    await lastMessageSound.unloadAsync();
                } catch (e) {}
            }
            
            // Use expo-av for playback
            const { sound } = await Audio.Sound.createAsync(
                { uri: audioUri },
                { shouldPlay: true }
            );
            lastMessageSound = sound;

            sound.setOnPlaybackStatusUpdate(async (status) => {
                if (status.isLoaded && status.didJustFinish) {
                    try {
                        await sound.unloadAsync();
                        if (lastMessageSound === sound) lastMessageSound = null;
                    } catch (e) {}
                    OverlayBridge.updateState('Idle');
                }
            });

        } catch (backendErr) {
            console.warn('Backend TTS failed (likely quota), falling back to native TTS:', backendErr);
            Speech.speak(text, {
                language: 'en',
                pitch: 1.0,
                rate: 0.9,
                onDone: () => OverlayBridge.updateState('Idle'),
                onError: () => OverlayBridge.updateState('Idle'),
            });
        }
    } catch (err) {
        console.error('Final TTS fallback failure:', err);
        OverlayBridge.updateState('Idle');
    }
};

// Listen for local forced alarm events
DeviceEventEmitter.addListener('ALARM_FIRED', async ({ label }) => {
    await speakText(`Attention! It's time for your alarm: ${label}`);
});

/**
 * Ensures the JS thread stays alive by playing a silent loop in the background.
 */
export const startBackgroundSilence = async () => {
    try {
        // We'll clean up any existing sound later in the function to avoid threading issues
        
        // A robust 100ms silent WAV (8bit mono 8kHz) - guaranteed valid structure
        const MINIMAL_SILENT_WAV = 'UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
        // Wait, the 44 byte one is just header. Let's use a slightly longer one with actual data.
        const VALID_SILENCE_WAV = 'UklGRjAAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YRAAAABAAAAAAAAAAAAAAAAAAA==';
        const silentFileUri = `${FileSystem.cacheDirectory}silence_v6.wav`;
        
        await FileSystem.writeAsStringAsync(silentFileUri, VALID_SILENCE_WAV, {
            encoding: FileSystem.EncodingType.Base64,
        });

        const fileInfo = await FileSystem.getInfoAsync(silentFileUri);
        const fileSize = fileInfo.exists ? fileInfo.size : 0;
        console.log(`[BackgroundService] Silent WAV created at: ${silentFileUri}, exists: ${fileInfo.exists}, size: ${fileSize}`);

        if (!fileInfo.exists) {
            throw new Error('Failed to write silent WAV file');
        }

        await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            staysActiveInBackground: true,
            playsInSilentModeIOS: true,
            shouldDuckAndroid: true,
            playThroughEarpieceAndroid: false,
        });

        if (backgroundSound) {
            const soundToUnload = backgroundSound;
            backgroundSound = null;
            try {
                await soundToUnload.unloadAsync();
            } catch (e) {}
        }

        const { sound } = await Audio.Sound.createAsync(
            { uri: silentFileUri },
            { shouldPlay: true, isLooping: true, volume: 0.0 }
        );
        backgroundSound = sound;
        console.log('[BackgroundService] Background silence successfully started with WAV');
    } catch (error: any) {
        console.error('[BackgroundService] Failed to start background silence:', error);
    }
};

export const stopBackgroundSilence = async () => {
    try {
        if (backgroundSound) {
            console.log('[BackgroundService] Stopping background silence...');
            await backgroundSound.stopAsync();
            await backgroundSound.unloadAsync();
            backgroundSound = null;
        }
    } catch (error) {
        console.error('[BackgroundService] Failed to stop background silence:', error);
    }
};

export const getWsState = () => ws?.readyState;

export const sendWsMessage = (payload: any) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
        return true;
    }
    return false;
};

const audioQueue: string[] = [];
let isAudioPlaying = false;
let isGlobalMuted = false;

export const setGlobalMuted = (muted: boolean) => {
    isGlobalMuted = muted;
    if (muted && isAudioPlaying) {
        // Stop current playback if muted
        Audio.setAudioModeAsync({ allowsRecordingIOS: false, staysActiveInBackground: true });
    }
};

export const playAudioChunk = async (base64: string) => {
    if (isGlobalMuted) return;
    audioQueue.push(base64);
    if (!isAudioPlaying) {
        processAudioQueue();
    }
};

const processAudioQueue = async () => {
    if (audioQueue.length === 0) {
        isAudioPlaying = false;
        return;
    }

    isAudioPlaying = true;
    const chunk = audioQueue.shift();
    if (!chunk) {
        processAudioQueue();
        return;
    }

    try {
        const audioUri = `data:audio/mp3;base64,${chunk}`;
        
        // Ensure audio mode is correct
        await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            staysActiveInBackground: true,
            playsInSilentModeIOS: true,
            shouldDuckAndroid: true,
            playThroughEarpieceAndroid: false,
        });

        const { sound } = await Audio.Sound.createAsync(
            { uri: audioUri },
            { shouldPlay: true }
        );

        sound.setOnPlaybackStatusUpdate(async (status) => {
            if (status.isLoaded && status.didJustFinish) {
                await sound.unloadAsync();
                processAudioQueue();
            }
        });
    } catch (err) {
        console.error('[BackgroundService] Chunk playback failed:', err);
        processAudioQueue();
    }
};

export const connectWs = async () => {
    if (isConnecting || (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING))) {
        return ws;
    }

    const token = await getAccessToken();
    if (!token) return null;

    isConnecting = true;
    const customUrl = await getServerUrl();
    
    const baseUrl = customUrl || DEFAULT_BASE_URL;
    
    let wsUrl: string;
    if (baseUrl.startsWith('http')) {
        wsUrl = baseUrl.replace(/^http/, 'ws') + '/ws?token=' + token;
    } else {
        wsUrl = `ws://${baseUrl}:3000/ws?token=${token}`;
    }

    if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
    }

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        isConnecting = false;
        if (reconnectTimer) {
            clearInterval(reconnectTimer);
            reconnectTimer = null;
        }
        (ws as any).__reconnectAttempts = 0;
        DeviceEventEmitter.emit('WS_CONNECTED');
    };

    ws.onmessage = async (e: MessageEvent) => {
        try {
            const event = JSON.parse(e.data);
            
            DeviceEventEmitter.emit('WS_EVENT', event);

            if (event.type === 'AI_AUDIO' && event.payload) {
                playAudioChunk(event.payload);
            }

            if (event.type === 'PING') {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'PONG' }));
                }
                return;
            }

            const isAppActive = AppState.currentState === 'active';

            if (event.type === 'WHATSAPP_MESSAGE') {
                const { from, text } = event.payload;
                if (!isAppActive) {
                    const ping = `[SYSTEM: Incoming WhatsApp message from ${from}: "${text}". Please summarize it briefly.]`;
                    try {
                        const response = await apiClient.post('/ai/message', { message: ping });
                        const aiMsg = response.data.data.message || response.data.data.result?.message;
                        if (aiMsg) {
                            DeviceEventEmitter.emit('PROACTIVE_ALERT', { text: aiMsg });
                            await speakText(aiMsg);
                        }
                    } catch (aiErr) {
                        console.error('[WS] Background AI trigger failed:', aiErr);
                    }
                }
            }

            if (event.type === 'TRIGGER_ALARM') {
                const { label } = event.payload;
                const msg = `Wake up! Your alarm for ${label} is going off now.`;
                if (!isAppActive) {
                    DeviceEventEmitter.emit('PROACTIVE_ALERT', { text: msg });
                    await speakText(msg);
                }
            }
        } catch (err) {
            console.error('[WS] Message parse error:', err);
        }
    };

    ws.onclose = () => {
        isConnecting = false;
        if (!reconnectTimer) {
            const attempts = (ws as any)?.__reconnectAttempts || 0;
            const delay = Math.min(5000 * Math.pow(2, attempts), 30000);
            (ws as any).__reconnectAttempts = attempts + 1;
            
            reconnectTimer = setTimeout(() => {
                reconnectTimer = null;
                connectWs();
            }, delay);
        }
    };

    ws.onerror = (e) => {
        isConnecting = false;
        console.error('[WS] WebSocket Error:', e);
    };

    return ws;
};
