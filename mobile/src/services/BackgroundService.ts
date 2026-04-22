import { Platform, DeviceEventEmitter, AppState } from 'react-native';
import { getAccessToken, getServerUrl } from '../utils/storage';
import { OverlayBridge } from '../native/OverlayBridge';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import * as FileSystem from 'expo-file-system/legacy';
import apiClient from '../api/client';
import { Buffer } from 'buffer';
import { DEFAULT_BASE_URL } from '../constants/settings';

const silenceAsset = require('../assets/silence.mp3');

let ws: WebSocket | null = null;
let reconnectTimer: any = null;
let backgroundSound: Audio.Sound | null = null;
let lastMessageSound: Audio.Sound | null = null;
let isConnecting = false;

export const speakText = async (text: string) => {
    // Wrap in setImmediate to ensure expo-av runs on main thread without being frozen by background timers
    setImmediate(async () => {
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
    });
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

        if (backgroundSound) {
            const soundToUnload = backgroundSound;
            backgroundSound = null;
            try {
                await soundToUnload.unloadAsync();
            } catch (e) {}
        }

        setImmediate(async () => {
            try {
                const { sound } = await Audio.Sound.createAsync(
                    { uri: silentFileUri },
                    { shouldPlay: true, isLooping: true, volume: 0.0 }
                );
                backgroundSound = sound;
                console.log('[BackgroundService] Background silence successfully started with WAV');
            } catch (err) {
                console.error('[BackgroundService] Failed to start background silence:', err);
            }
        });
    } catch (error: any) {
        console.error('[BackgroundService] File system error creating background silence WAV:', error);
    }
};

export const stopBackgroundSilence = async () => {
    try {
        setImmediate(async () => {
            if (backgroundSound) {
                console.log('[BackgroundService] Stopping background silence...');
                try {
                    await backgroundSound.stopAsync();
                    await backgroundSound.unloadAsync();
                } catch (e) {}
                backgroundSound = null;
            }
        });
    } catch (error) {
        console.error('[BackgroundService] Failed to stop background silence:', error);
    }
};

export const getWsState = () => undefined;



export const sendWsMessage = (payload: any) => {
    return false;
};

const audioQueue: string[] = [];
let isAudioPlaying = false;

export const playAudioChunk = async (base64: string) => {
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
        // Write to temp file instead of data URI (more reliable on Android)
        const fileUri = `${FileSystem.cacheDirectory}tts_chunk_${Date.now()}.mp3`;
        await FileSystem.writeAsStringAsync(fileUri, chunk, {
            encoding: FileSystem.EncodingType.Base64,
        });
        
        setImmediate(async () => {
            try {
                const { sound } = await Audio.Sound.createAsync(
                    { uri: fileUri },
                    { shouldPlay: true }
                );

                sound.setOnPlaybackStatusUpdate(async (status) => {
                    if (status.isLoaded && status.didJustFinish) {
                        await sound.unloadAsync();
                        FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
                        processAudioQueue();
                    }
                });
            } catch (err) {
                console.error('[BackgroundService] Chunk playback failed:', err);
                processAudioQueue();
            }
        });
    } catch (err) {
        console.error('[BackgroundService] File system error for chunk:', err);
        processAudioQueue();
    }
};

export const connectWs = async () => {
    // Deprecated: Replaced by SocketIOService
    return null;
};
