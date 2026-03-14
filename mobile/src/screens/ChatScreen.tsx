import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    Platform, ScrollView, Dimensions, KeyboardAvoidingView,
    ActivityIndicator
} from 'react-native';
import { useAI } from '../hooks/useAI';
import { Send, Keyboard, X, Volume2, VolumeX, Mail, MessageCircle } from 'lucide-react-native';
import AudioRecorder from '../components/AudioRecorder';
import PixelEyes, { EyeState } from '../components/PixelEyes';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp, FadeIn, Layout, SlideInDown } from 'react-native-reanimated';
import { getAccessToken } from '../utils/storage';
import { API_URL, getDynamicApiUrl } from '../api/client';
import { useSoraSettings } from '../context/SoraSettingsContext';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// ElevenLabs Text-to-Speech via backend
const speakText = async (text: string, voiceId?: string, onEnd?: () => void) => {
    try {
        const apiClient = require('../api/client').default;
        const { Audio } = require('expo-av');

        // Fetch audio from backend (ElevenLabs)
        const response = await apiClient.post('/voice/synthesize', { text, voiceId }, { responseType: 'arraybuffer' });
        const audioBase64 = btoa(
            new Uint8Array(response.data).reduce((s, b) => s + String.fromCharCode(b), '')
        );
        const audioUri = `data:audio/mpeg;base64,${audioBase64}`;

        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, shouldDuckAndroid: false });
        const { sound } = await Audio.Sound.createAsync({ uri: audioUri }, { shouldPlay: true });
        sound.setOnPlaybackStatusUpdate((status: any) => {
            if (status.didJustFinish) {
                sound.unloadAsync();
                onEnd?.();
            }
        });
        return;
    } catch (err) {
        console.warn('ElevenLabs TTS failed, falling back to device speech:', err);
    }

    // Fallback: device TTS
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.92;
        utterance.pitch = 0.85;
        if (onEnd) utterance.onend = onEnd;
        window.speechSynthesis.speak(utterance);
        return;
    }
    try {
        const Speech = require('expo-speech');
        Speech.speak(text, { language: 'en-US', rate: 0.9, pitch: 0.85, onDone: onEnd });
    } catch {
        onEnd?.();
    }
};

export default function ChatScreen() {
    const [input, setInput] = useState('');
    const [showTextInput, setShowTextInput] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [amplitude, setAmplitude] = useState(0);
    const { settings } = useSoraSettings();
    const { messages, sendMessage, loading } = useAI();
    const scrollRef = useRef<ScrollView>(null);
    const wsRef = useRef<WebSocket | null>(null);

    // Eye state logic
    const [eyeState, setEyeState] = useState<EyeState>('idle');
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        if (hasError) {
            setEyeState('error');
        } else if (isSpeaking) {
            setEyeState('speaking');
        } else if (loading) {
            const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content?.toLowerCase() || '';
            if (lastUserMsg.includes('whatsapp')) {
                setEyeState('whatsapp');
            } else if (lastUserMsg.includes('email') || lastUserMsg.includes('gmail') || lastUserMsg.includes('mail')) {
                setEyeState('email');
            } else {
                setEyeState('thinking');
            }
        } else if (input.length > 0) {
            setEyeState('typing');
        } else {
            setEyeState('idle');
        }
    }, [isSpeaking, loading, input, messages, hasError]);

    const handleSend = useCallback(async (text?: string) => {
        const msg = text || input.trim();
        if (!msg) return;

        try {
            await sendMessage(msg);
            setInput('');
        } catch (err) {
            setHasError(true);
            setTimeout(() => setHasError(false), 3000);
        }
    }, [input, sendMessage]);

    // Unified WebSocket Event Listener (WhatsApp, Alarms, etc.)
    useEffect(() => {
        const { DeviceEventEmitter } = require('react-native');
        const { connectWs } = require('../services/BackgroundService');

        // Ensure background WS is connected
        connectWs();

        const wsSub = DeviceEventEmitter.addListener('WS_EVENT', async (event: any) => {
            if (event.type === 'WHATSAPP_MESSAGE') {
                const { from, text } = event.payload;
                const ping = `[SYSTEM: Incoming WhatsApp message from ${from}: "${text}". Please politely tell me who messaged me and what they said, and ask if I would like you to reply to them. Keep it short and conversational.]`;
                sendMessage(ping);
            }
        });

        return () => wsSub.remove();
    }, [sendMessage]);

    // Auto-speak AI responses (only if not muted)
    useEffect(() => {
        if (messages.length > 0) {
            const lastMsg = messages[messages.length - 1];
            // Only speak regular assistant responses aloud
            if (lastMsg.role === 'assistant' && lastMsg.content && !lastMsg.content.startsWith('[SYSTEM:')) {
                if (!isMuted) {
                    setIsSpeaking(true);
                    speakText(lastMsg.content, settings.voiceId, () => setIsSpeaking(false));
                }
            }
        }
    }, [messages.length]);

    // Auto-scroll to bottom
    useEffect(() => {
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }, [messages.length]);

    const handleTranscription = useCallback((text: string) => {
        if (text) handleSend(text);
    }, [handleSend]);

    return (
        <LinearGradient colors={['#0f172a', '#020617']} style={styles.container}>
            {/* Eyes Section */}
            <View style={styles.globeContainer}>
                <LinearGradient
                    colors={['rgba(59, 130, 246, 0.1)', 'transparent']}
                    style={StyleSheet.absoluteFillObject}
                />
                {/* Mute Toggle — top right of the eye section */}
                <TouchableOpacity
                    style={styles.muteBtn}
                    onPress={() => setIsMuted(v => !v)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                    {isMuted
                        ? <VolumeX color="#f87171" size={20} strokeWidth={2} />
                        : <Volume2 color="#94a3b8" size={20} strokeWidth={2} />
                    }
                </TouchableOpacity>
                <View style={styles.eyeRow}>
                    <View style={[styles.taskIcon, { opacity: eyeState === 'email' ? 1 : 0.2 }]}>
                        <Mail color="#60a5fa" size={28} />
                        <Text style={styles.iconLabel}>EMAIL</Text>
                    </View>

                    <View style={styles.eyesWrapper}>
                        <PixelEyes
                            state={eyeState}
                            amplitude={amplitude}
                            isListening={isRecording}
                            eyeColor={settings.eyeColor}
                        />
                    </View>

                    <View style={[styles.taskIcon, { opacity: eyeState === 'whatsapp' ? 1 : 0.2 }]}>
                        <MessageCircle color="#34d399" size={28} />
                        <Text style={styles.iconLabel}>W-APP</Text>
                    </View>
                </View>
            </View>

            {/* Chat messages */}
            <ScrollView
                ref={scrollRef}
                style={styles.messagesContainer}
                contentContainerStyle={styles.messagesList}
                showsVerticalScrollIndicator={false}
            >
                {messages.length === 0 && (
                    <Animated.View entering={FadeIn.delay(300)} style={styles.emptyState}>
                        <Text style={styles.emptyTitle}>SORA IS READY</Text>
                        <Text style={styles.emptySubtitle}>Tap the mic to start talking</Text>
                    </Animated.View>
                )}
                {messages.filter(msg => !(msg.content || '').startsWith('[SYSTEM: Contact')).map((msg: any, i: number) => {
                    const isUser = msg.role === 'user';
                    const contentStr = msg.content || '';
                    const isSystem = contentStr.startsWith('[SYSTEM:');

                    const displayContent = isSystem ? contentStr.replace('[SYSTEM: ', '').replace(']', '') : contentStr;

                    return (
                        <Animated.View
                            key={i}
                            entering={SlideInDown.springify().mass(0.8).damping(15)}
                            layout={Layout.springify().damping(15)}
                            style={[
                                styles.messageBubble,
                                isUser ? styles.userBubble : styles.aiBubble
                            ]}
                        >
                            <LinearGradient
                                colors={isUser ? ['#2563eb', '#1d4ed8'] : ['rgba(30, 41, 59, 0.8)', 'rgba(15, 23, 42, 0.8)']}
                                style={StyleSheet.absoluteFillObject}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                            />
                            {!isUser && (
                                <View style={styles.aiLabel}>
                                    <Volume2 color={isSystem ? "#34d399" : "#60a5fa"} size={12} />
                                    <Text style={[styles.aiLabelText, isSystem && { color: '#34d399' }]}>
                                        {isSystem ? 'WHATSAPP' : 'SORA'}
                                    </Text>
                                </View>
                            )}
                            <Text style={[
                                styles.messageText,
                                isUser ? styles.userText : styles.aiText
                            ]}>
                                {displayContent}
                            </Text>
                        </Animated.View>
                    );
                })}
                {loading && (
                    <Animated.View entering={FadeIn} style={[styles.messageBubble, styles.aiBubble, { overflow: 'hidden' }]}>
                        <LinearGradient
                            colors={['rgba(30, 41, 59, 0.8)', 'rgba(15, 23, 42, 0.8)']}
                            style={StyleSheet.absoluteFillObject}
                        />
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                            <ActivityIndicator color="#fbbf24" size="small" />
                            <Text style={styles.thinkingText}> THINKING...</Text>
                        </View>
                    </Animated.View>
                )}
            </ScrollView>

            {/* Input area */}
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.inputArea}
            >
                {showTextInput && (
                    <Animated.View entering={FadeInUp} style={styles.textInputRow}>
                        <TextInput
                            style={styles.textInput}
                            placeholder="Type a message..."
                            placeholderTextColor="#94a3b8"
                            value={input}
                            onChangeText={setInput}
                            multiline
                            onSubmitEditing={() => handleSend()}
                        />
                        <TouchableOpacity
                            style={styles.sendBtn}
                            onPress={() => handleSend()}
                            disabled={!input.trim() || loading}
                        >
                            <LinearGradient
                                colors={['#3b82f6', '#2563eb']}
                                style={StyleSheet.absoluteFillObject}
                            />
                            <Send color="#fff" size={18} />
                        </TouchableOpacity>
                    </Animated.View>
                )}
                <View style={styles.controlsRow}>
                    <TouchableOpacity
                        style={styles.toggleBtn}
                        onPress={() => setShowTextInput(!showTextInput)}
                    >
                        {showTextInput ? <X color="#94a3b8" size={24} /> : <Keyboard color="#94a3b8" size={24} />}
                    </TouchableOpacity>

                    <AudioRecorder
                        onTranscription={handleTranscription}
                        onRecordingState={setIsRecording}
                        onAmplitude={setAmplitude}
                    />

                    <View style={{ width: 44 }} />
                </View>
            </KeyboardAvoidingView>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    globeContainer: {
        height: Platform.OS === 'web' ? SCREEN_HEIGHT * 0.35 : 260,
        justifyContent: 'flex-start',
        alignItems: 'center',
        paddingTop: 16,
    },
    eyeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        paddingHorizontal: 20,
    },
    eyesWrapper: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    taskIcon: {
        alignItems: 'center',
        justifyContent: 'center',
        width: 60,
    },
    iconLabel: {
        color: '#fff',
        fontSize: 10,
        marginTop: 6,
        fontWeight: '800',
        letterSpacing: 1.5,
    },
    messagesContainer: {
        flex: 1,
        paddingHorizontal: 16,
    },
    messagesList: {
        paddingVertical: 12,
    },
    emptyState: {
        alignItems: 'center',
        paddingTop: 60,
    },
    emptyTitle: {
        color: '#60a5fa',
        fontSize: 22,
        fontWeight: '800',
        letterSpacing: 4,
    },
    emptySubtitle: {
        color: '#94a3b8',
        fontSize: 14,
        marginTop: 12,
        letterSpacing: 1,
    },
    messageBubble: {
        maxWidth: '85%',
        padding: 16,
        marginBottom: 16,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    userBubble: {
        alignSelf: 'flex-end',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        borderBottomLeftRadius: 20,
        borderBottomRightRadius: 4,
    },
    aiBubble: {
        alignSelf: 'flex-start',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        borderBottomRightRadius: 20,
        borderBottomLeftRadius: 4,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    aiLabel: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    aiLabelText: {
        color: '#60a5fa',
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 2,
        marginLeft: 6,
    },
    messageText: {
        fontSize: 16,
        lineHeight: 24,
    },
    userText: {
        color: '#fff',
        fontWeight: '500',
    },
    aiText: {
        color: '#e2e8f0',
    },
    thinkingText: {
        color: '#fbbf24',
        fontSize: 14,
        fontWeight: '700',
        letterSpacing: 2,
    },
    inputArea: {
        paddingBottom: Platform.OS === 'ios' ? 34 : 20,
        paddingHorizontal: 16,
        paddingTop: 16,
        backgroundColor: 'rgba(2, 6, 23, 0.8)',
        borderTopWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    textInputRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        marginBottom: 20,
    },
    textInput: {
        flex: 1,
        backgroundColor: 'rgba(30, 41, 59, 0.6)',
        borderRadius: 24,
        paddingHorizontal: 20,
        paddingVertical: 14,
        color: '#fff',
        fontSize: 16,
        maxHeight: 120,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    sendBtn: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 12,
        overflow: 'hidden',
    },
    controlsRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 32,
    },
    toggleBtn: {
        width: 50,
        height: 50,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(30, 41, 59, 0.4)',
        borderRadius: 25,
    },
    muteBtn: {
        position: 'absolute',
        top: 10,
        right: 14,
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(15, 23, 42, 0.85)',
        borderRadius: 20,
        borderWidth: 1.5,
        borderColor: 'rgba(148,163,184,0.25)',
        zIndex: 10,
        // Shadow for visibility
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.4,
        shadowRadius: 4,
        elevation: 6,
    },
});
