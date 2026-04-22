import React, { useState, useRef, useEffect } from 'react';
import { TouchableOpacity, ActivityIndicator, StyleSheet, Platform, View, Text, DeviceEventEmitter } from 'react-native';
import { Mic } from 'lucide-react-native';
import apiClient from '../api/client';
import { getAccessToken } from '../utils/storage';

// Web audio recording using MediaRecorder API
const useWebRecording = () => {
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const streamRef = useRef<MediaStream | null>(null);

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            mediaRecorderRef.current = mediaRecorder;
            chunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };

            mediaRecorder.start();
            return true;
        } catch (err) {
            console.error('Web recording error:', err);
            return false;
        }
    };

    const stopRecording = (): Promise<Blob | null> => {
        return new Promise((resolve) => {
            const mediaRecorder = mediaRecorderRef.current;
            if (!mediaRecorder) { resolve(null); return; }

            mediaRecorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
                // Stop all tracks
                streamRef.current?.getTracks().forEach(t => t.stop());
                resolve(blob);
            };
            mediaRecorder.stop();
        });
    };

    return { startRecording, stopRecording };
};

// Native audio recording using expo-av
const useNativeRecording = () => {
    const recordingRef = useRef<any>(null);

    const startRecording = async () => {
        try {
            const Audio = require('expo-av').Audio;
            const { status } = await Audio.requestPermissionsAsync();
            if (status !== 'granted') {
                console.error('Audio permission denied');
                return false;
            }
            try {
                await Audio.setAudioModeAsync({
                    allowsRecordingIOS: true,
                    playsInSilentModeIOS: true,
                    staysActiveInBackground: true,
                    shouldDuckAndroid: true,
                });
            } catch (modeErr) { }
            const { recording } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY
            );
            recordingRef.current = recording;
            return true;
        } catch (err) {
            console.error('Native recording error:', err);
            return false;
        }
    };

    const stopRecording = async (): Promise<string | null> => {
        try {
            const recording = recordingRef.current;
            if (!recording) return null;
            await recording.stopAndUnloadAsync();
            const uri = recording.getURI();
            recordingRef.current = null;
            return uri;
        } catch (err) {
            console.error('Stop recording error:', err);
            return null;
        }
    };

    return { startRecording, stopRecording };
};

interface AudioRecorderProps {
    onTranscription: (text: string) => void;
    onRecordingState?: (isRecording: boolean) => void;
    onAmplitude?: (level: number) => void;
}

export default function AudioRecorder({ onTranscription, onRecordingState, onAmplitude }: AudioRecorderProps) {
    const [isRecording, setIsRecording] = useState(false);
    const [loading, setLoading] = useState(false);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animFrameRef = useRef<number>(0);

    // Dynamic state reference for closures
    const isRecordingRef = useRef(false);
    useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);

    const handlePressRef = useRef<() => void>(undefined);

    useEffect(() => {
        const sub = DeviceEventEmitter.addListener('BLUETOOTH_TRIGGER_MIC', () => {
            console.log('Intercepted Background Hardware Trigger!');
            if (handlePressRef.current) {
                handlePressRef.current();
            }
        });
        return () => sub.remove();
    }, []);

    // Web amplitude monitoring
    const startAmplitudeMonitoring = (stream: MediaStream) => {
        if (Platform.OS !== 'web' || !onAmplitude) return;
        try {
            const audioCtx = new AudioContext();
            const source = audioCtx.createMediaStreamSource(stream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            analyserRef.current = analyser;

            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            const tick = () => {
                analyser.getByteFrequencyData(dataArray);
                const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
                onAmplitude(Math.min(avg / 128, 1));
                animFrameRef.current = requestAnimationFrame(tick);
            };
            tick();
        } catch (e) {
            console.warn('Amplitude monitoring failed:', e);
        }
    };

    const stopAmplitudeMonitoring = () => {
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        analyserRef.current = null;
        onAmplitude?.(0);
    };

    const handlePress = async () => {
        if (isRecordingRef.current) {
            // Stop recording & transcribe
            setIsRecording(false);
            onRecordingState?.(false);
            stopAmplitudeMonitoring();
            setLoading(true);

            try {
                let formData = new FormData();

                if (Platform.OS === 'web') {
                    // Web: use MediaRecorder
                    const mediaRecorder = (window as any).__mediaRecorder;
                    const blob: Blob = await new Promise((resolve) => {
                        mediaRecorder.onstop = () => {
                            const blob = new Blob((window as any).__audioChunks, { type: 'audio/webm' });
                            (window as any).__audioStream?.getTracks().forEach((t: any) => t.stop());
                            resolve(blob);
                        };
                        mediaRecorder.stop();
                    });

                    const file = new File([blob], 'voice.webm', { type: 'audio/webm' });
                    formData.append('audio', file);
                } else {
                    // Mobile: use expo-av
                    const Audio = require('expo-av').Audio;
                    const recording = (global as any).__nativeRecording;
                    if (!recording) throw new Error('No recording found');
                    await recording.stopAndUnloadAsync();
                    const uri = recording.getURI();
                    (global as any).__nativeRecording = null;

                    formData.append('audio', {
                        uri,
                        type: 'audio/m4a',
                        name: 'voice.m4a'
                    } as any);
                }

                const token = await getAccessToken();
                const response = await apiClient.post('/voice/transcribe', formData, {
                    headers: {
                        'Content-Type': 'multipart/form-data',
                        'Authorization': `Bearer ${token}`
                    }
                });

                const text = response.data?.data?.text;
                if (text) {
                    onTranscription(text);
                }
            } catch (err) {
                console.error('Transcription failed:', err);
            } finally {
                setLoading(false);
            }
        } else {
            // Start recording
            try {
                if (Platform.OS === 'web') {
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    (window as any).__audioStream = stream;
                    const mediaRecorder = new MediaRecorder(stream, {
                        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
                    });
                    (window as any).__mediaRecorder = mediaRecorder;
                    (window as any).__audioChunks = [] as Blob[];

                    mediaRecorder.ondataavailable = (e: BlobEvent) => {
                        if (e.data.size > 0) (window as any).__audioChunks.push(e.data);
                    };

                    mediaRecorder.start();
                    startAmplitudeMonitoring(stream);
                } else {
                    // Mobile: use expo-av
                    // IMPORTANT: Always reset audio mode to recording before creating a new recorder.
                    // Not doing this causes 'Recorder does not exist' if TTS ran previously
                    // (TTS sets allowsRecordingIOS: false, which invalidates any new recorder).
                    const Audio = require('expo-av').Audio;

                    // Step 1: Explicitly request permission
                    const { status } = await Audio.requestPermissionsAsync();
                    if (status !== 'granted') {
                        console.error('[Mic] Mic permission denied');
                        return;
                    }

                    // Step 2: Tear down existing recording if any (defensive cleanup)
                    const existing = (global as any).__nativeRecording;
                    if (existing) {
                        try { await existing.stopAndUnloadAsync(); } catch { }
                        (global as any).__nativeRecording = null;
                    }

                    // Step 3: Set audio mode to RECORDING (overrides TTS mode)
                    try {
                        await Audio.setAudioModeAsync({
                            allowsRecordingIOS: true,
                            playsInSilentModeIOS: true,
                            staysActiveInBackground: true,
                            shouldDuckAndroid: true,
                        });
                    } catch (modeErr) {}

                    // Step 4: Create a fresh recorder
                    const { recording } = await Audio.Recording.createAsync(
                        Audio.RecordingOptionsPresets.HIGH_QUALITY
                    );
                    (global as any).__nativeRecording = recording;
                    console.log('[Mic] Recording started successfully.');
                }

                setIsRecording(true);
                onRecordingState?.(true);
            } catch (err) {
                console.error('Failed to start recording:', err);
            }
        }
    };

    handlePressRef.current = handlePress;

    return (
        <TouchableOpacity
            style={[styles.button, isRecording && styles.recording]}
            onPress={handlePress}
            disabled={loading}
        >
            {loading ? (
                <ActivityIndicator color="#fff" />
            ) : (
                <Mic color="#fff" size={24} />
            )}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    button: {
        backgroundColor: '#007AFF',
        width: 56,
        height: 56,
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
    },
    recording: {
        backgroundColor: '#FF3B30',
    }
});
