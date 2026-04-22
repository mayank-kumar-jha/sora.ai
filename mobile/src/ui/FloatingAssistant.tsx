import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, PanResponder, useWindowDimensions, Platform, DeviceEventEmitter, TouchableOpacity, AppState, AppStateStatus, InteractionManager } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import DynamicIsland from './DynamicIsland';
import MiniChatPanel, { ChatMessage, UtilityEvent } from './MiniChatPanel';
import { AssistantFaceState } from '../animations/AssistantFace';
import apiClient from '../api/client';
import { Audio } from 'expo-av';
import { getAccessToken, getServerUrl } from '../utils/storage';
import { DEFAULT_BASE_URL } from '../constants/settings';
import * as FileSystem from 'expo-file-system/legacy';
import { useSoraSettings } from '../context/SoraSettingsContext';
import { OverlayBridge } from '../native/OverlayBridge';
import { stopBackgroundSilence, startBackgroundSilence } from '../services/BackgroundService';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import { emitLiveStart, emitLiveAudio, emitLiveStop, emitAiChat, isSocketConnected, connectSocketIO } from '../services/SocketIOService';
import { handleClientAction } from '../hooks/useAI';

const WHISPER_PRESET: Audio.RecordingOptions = {
  android: {
    extension: '.m4a',
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 128000,
  },
  ios: {
    extension: '.m4a',
    audioQuality: Audio.IOSAudioQuality.MIN,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 128000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {},
};

const executedUIEventIds = new Set<string>();

export default function FloatingAssistant() {
  const { width } = useWindowDimensions();
  const { settings } = useSoraSettings();

  const [isExpanded, setIsExpanded] = useState(false);
  const [faceState, setFaceState] = useState<AssistantFaceState>('Idle');
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isHalfScreen, setIsHalfScreen] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [overlayActive, setOverlayActive] = useState(false);
  const [activeTimer, setActiveTimer] = useState<string | undefined>();
  const [utilityEvents, setUtilityEvents] = useState<UtilityEvent[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [conversationId] = useState(uuidv4());
  const lastSyncedMessageIndex = useRef(-1);
  useEffect(() => {
    OverlayBridge.setConversationId(conversationId);
  }, [conversationId]);

  // Connect Socket.IO on mount (with retry for token availability)
  useEffect(() => {
    let retryCount = 0;
    const maxRetries = 5;
    
    const tryConnect = async () => {
      const sock = await connectSocketIO();
      if (sock?.connected) {
        console.log('[FloatingAssistant] Socket.IO connected successfully');
      } else if (retryCount < maxRetries) {
        retryCount++;
        const delay = retryCount * 2000; // 2s, 4s, 6s, 8s, 10s
        console.warn(`[FloatingAssistant] Socket.IO not connected, retry ${retryCount}/${maxRetries} in ${delay/1000}s`);
        setTimeout(tryConnect, delay);
      } else {
        console.error('[FloatingAssistant] Socket.IO connection failed after max retries');
      }
    };
    
    // Initial delay to let auth system initialize
    setTimeout(tryConnect, 1000);

    // Initialize Audio mode once on mount to prevent keep-awake errors in background
    try {
      Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: true, // MUST BE TRUE so OS doesn't freeze the JS thread
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      }).catch(err => console.warn('[FloatingAssistant] setAudioModeAsync threw (ignoring):', err.message));
    } catch (e) {}
  }, []);


  const isLiveModeRef = useRef(false);
  const isCapturingRef = useRef(false);
  const isVisionProcessing = useRef(false);
  const isListeningRef = useRef(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const isProcessingMic = useRef(false);
  const backgroundRecordingTimer = useRef<NodeJS.Timeout | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const pendingVisionTranscriptRef = useRef<string | null>(null);
  const visionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const streamingMessageRef = useRef<string>('');  // Accumulates streaming tokens
  const streamingMessageIdRef = useRef<string>('');  // ID of the streaming message bubble
  const streamingUpdatePending = useRef(false);  // Throttle flag for token updates

  // ─── Overlay Lifecycle: show native overlay when backgrounded ──────────────
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const subscription = AppState.addEventListener('change', async (nextState) => {
      console.log(`[FloatingAssistant] AppState changed: ${appStateRef.current} -> ${nextState}`);
      if (
        appStateRef.current.match(/active/) &&
        nextState.match(/inactive|background/)
      ) {
        // App going to background → start native overlay
        const hasOverlayPermission = await OverlayBridge.hasPermission();
        if (hasOverlayPermission) {
          OverlayBridge.startOverlay(settings.eyeColor);
        } else {
          console.warn('[FloatingAssistant] Permission for overlay missing, skipping start.');
        }
      } else if (
        appStateRef.current.match(/inactive|background/) &&
        nextState === 'active'
      ) {
        // App resumed → only HIDE the overlay UI, don't kill the session
        OverlayBridge.hideOverlay();
        
        // Check for any actions triggered from the overlay
        // Retry up to 3 times with 200ms delay in case of race condition with Intent processing
        let action = null;
        for (let i = 0; i < 3; i++) {
          action = await OverlayBridge.getInitialAction();
          if (action) break;
          await new Promise(resolve => setTimeout(resolve, 200));
        }

          console.log(`[FloatingAssistant] App resumed. Action found: ${action}`);
          if (action === 'ask') {
            handleMicPress();
          } else if (action === 'vision' || action === 'request_vision') {
            // If we just launched to request permission/capture, handle it
            console.log('[Vision] Triggering capture from initial action');
            setTimeout(() => handleVisionPress(), 500);
          }
      }
      appStateRef.current = nextState;
    });

    return () => {
      subscription.remove();
      OverlayBridge.stopOverlay();
    };
  }, []); // Only run once to setup listeners

  // 1.1 Sync eye color changes to running overlay
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    OverlayBridge.updateEyeColor(settings.eyeColor);
  }, [settings.eyeColor]);

  // 1.2 removed: sync is now explicitly handled in addMessage

  // Sync face state changes to running overlay
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    OverlayBridge.updateState(faceState);
  }, [faceState]);

  // Sync capturing status to running overlay
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    OverlayBridge.updateIsCapturing(isCapturing);
  }, [isCapturing]);

  // ─── Transcripts Recovery & Accessibility Check ──────────────
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const init = async () => {
      // 1. Recover transcript from relaunch
      const transcript = await OverlayBridge.getVisionTranscript();
      if (transcript) {
        console.log(`[Vision] Recovered transcript from relaunch: "${transcript}"`);
        pendingVisionTranscriptRef.current = transcript;
        setFaceState('Thinking');
        OverlayBridge.updateState('Thinking');
        
        // Auto-trigger vision press if we have a pending transcript after relaunch
        handleVisionPress();
      }

      // 2. Initial Accessibility Check
      const hasAccessibility = await OverlayBridge.hasAccessibilityPermission();
      if (!hasAccessibility) {
        console.warn('[Vision] Accessibility Service is OFF. Screen captures will require app relaunches.');
      }
    };
    init();
  }, []);

  // No longer using draggability for the capsule
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const addMessage = (text: string, sender: 'user' | 'ai', isBase64Image?: boolean) => {
    const imgBase64 = isBase64Image ? text : undefined;
    const cleanText = isBase64Image ? '' : text;
    setMessages(prev => [...prev, { id: Date.now().toString() + Math.random(), text: cleanText, sender, imageBase64: imgBase64 }]);
    if (Platform.OS === 'android') {
      OverlayBridge.addMessage(cleanText, sender, imgBase64);
    }
  };

  const handleToggleSize = () => {
    setIsHalfScreen(prev => !prev);
  };

  const handleTripleTap = () => {
    setShowNotes(prev => !prev);
    if (!isExpanded) setIsExpanded(true);
  };

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startTimer = (seconds: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    let remaining = seconds;

    timerRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        setActiveTimer(undefined);
        setFaceState('Alert');
      } else {
        const mins = Math.floor(remaining / 60);
        const secs = remaining % 60;
        setActiveTimer(`${mins}:${secs < 10 ? '0' : ''}${secs}`);
      }
    }, 1000);
  };

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (visionTimeoutRef.current) clearTimeout(visionTimeoutRef.current);
      if (backgroundRecordingTimer.current) clearTimeout(backgroundRecordingTimer.current);
    };
  }, []);

  useEffect(() => {
    isCapturingRef.current = isCapturing;
    OverlayBridge.updateIsCapturing(isCapturing);
  }, [isCapturing]);

  // NOTE: isListeningRef and recordingRef are set DIRECTLY in handleMicPress,
  // not through useEffect, because useEffect won't fire reliably when app is backgrounded.

  useEffect(() => {
    // ─── Gemini Live PCM Streaming (Incoming from Native) ────────
    const pcmSub = DeviceEventEmitter.addListener('PCM_AUDIO_CHUNK', (data) => {
      if (isLiveModeRef.current && data.audio) {
        emitLiveAudio(data.audio);
      }
    });

    // ─── Gemini Live Audio (Outgoing to Speakers) ──────────────
    const liveAudioOutSub = DeviceEventEmitter.addListener('LIVE_AUDIO_OUT', async (data) => {
      if (isLiveModeRef.current && data.audio) {
        setFaceState('Speaking');
        OverlayBridge.updateState('Speaking');
        await playLiveAudioChunk(data.audio);
        
        setTimeout(() => {
            if (isLiveModeRef.current) {
                setFaceState('Listening');
                OverlayBridge.updateState('Listening');
            }
        }, 1500);
      }
    });

    const liveEndedSub = DeviceEventEmitter.addListener('LIVE_SESSION_ENDED', () => {
        setIsLiveMode(false);
        isLiveModeRef.current = false;
        setFaceState('Idle');
        OverlayBridge.updateState('Idle');
        OverlayBridge.stopPCMStreaming();
        startBackgroundSilence();
    });

    // 5. Native Recording Handlers
    const recordingFinishedSub = DeviceEventEmitter.addListener('RECORDING_FINISHED', async (data) => {
      console.log(`[Assistant] Native recording finished: ${data.uri}`);
      await processAudioFile(data.uri);
    });

    const recordingErrorSub = DeviceEventEmitter.addListener('RECORDING_ERROR', (data) => {
      console.error(`[Assistant] Native recording error: ${data.error}`);
      setFaceState('Idle');
      addMessage("Sorry, I couldn't start recording.", 'ai');
    });

    // 1. Listen for Proactive Alerts from the Background WebSocket
    const alertSub = DeviceEventEmitter.addListener('PROACTIVE_ALERT', (data) => {
      setIsExpanded(true);
      setFaceState('Alert');
      addMessage(data.text, 'ai');

      setTimeout(() => {
        setFaceState('Idle');
      }, 8000);
    });

    // 2. Listen for Screenshot Captured events (from RootLayout or Native)
    const screenshotSub = DeviceEventEmitter.addListener('SCREENSHOT_CAPTURED', async (data) => {
      console.log(`[Vision] Received SCREENSHOT_CAPTURED event. Processing: ${isVisionProcessing.current}`);
      if (isVisionProcessing.current) {
        console.warn('[Vision] Ignoring duplicate screenshot event (lock active)');
        return;
      }
      isVisionProcessing.current = true;

      try {
        if (!data?.base64) {
          throw new Error("Screenshot data is empty");
        }
        
        console.log(`[Vision] Data base64 length: ${data.base64.length}`);

        if (pendingVisionTranscriptRef.current) {
          const transcript = pendingVisionTranscriptRef.current;
          pendingVisionTranscriptRef.current = null;
          console.log(`[Vision] Handling voice-to-vision request with transcript: "${transcript}"`);
          await handleAiRequest(transcript, data.base64);
        } else {
          console.log(`[Vision] Handling manual manual screenshot capture`);
          await handleVisionCaptureResult(data.base64);
        }
        } catch (err: any) {
        console.error(`[Vision] Error processing screenshot: ${err.message}`);
        addMessage(`Vision Error: ${err.message}`, 'ai');
        setIsCapturing(false);
        setFaceState('Idle');
        OverlayBridge.updateState('Idle');
      } finally {
        console.log('[Vision] Releasing vision processing lock');
        isVisionProcessing.current = false;
        if (visionTimeoutRef.current) {
          clearTimeout(visionTimeoutRef.current);
          visionTimeoutRef.current = null;
        }
      }
    });

    // 2.1 Listen for Screenshot Error (Permission Needed)
    const screenshotErrorSub = DeviceEventEmitter.addListener('SCREENSHOT_ERROR', (data) => {
      console.error(`[Vision] Screenshot Error: ${data.error}`);
      addMessage(`Vision Error: ${data.error}`, 'ai'); // Inform user
      
      pendingVisionTranscriptRef.current = null;
      isVisionProcessing.current = false;
      
      // Reset state
      setIsCapturing(false);
      setFaceState('Idle');
      OverlayBridge.resetVisionCapture();
      OverlayBridge.updateState('Idle');
    });

    // 4. Listen for Native Overlay Action Events (Direct from OverlayService)
    const overlayActionSub = DeviceEventEmitter.addListener('OVERLAY_ACTION', (event) => {
      console.log(`[FloatingAssistant] Native Overlay Action: ${event.action}`);
      if (event.action === 'vision') {
        handleVisionPress();
      } else if (event.action === 'sendText' && event.text) {
        handleAiRequest(event.text);
      }
    });

    const nativeMicClickSub = DeviceEventEmitter.addListener('MIC_CLICKED', () => {
      handleMicPress(); // Maps native Mic click to RN Mic function
    });

    const liveStartReqSub = DeviceEventEmitter.addListener('LIVE_START_REQUESTED', () => {
      handleMicLongPress(); // Maps native Mic long-press to RN Live function
    });
    
    const liveEndReqSub = DeviceEventEmitter.addListener('LIVE_END_REQUESTED', () => {
      if (isLiveModeRef.current) {
         handleMicLongPress(); // Toggles it off
      }
    });

    // 6. Listen for async device actions pushed via Socket.IO (WhatsApp, Calling, etc.)
    const wsDeviceActionSub = DeviceEventEmitter.addListener('WS_EVENT', (data) => {
      // ─── Streaming AI tokens ──────────────────────────────────
      if (data.type === 'AI_TOKEN' && data.content) {
        streamingMessageRef.current += data.content;
        // Throttle UI updates to every 50ms to prevent main thread flooding
        if (!streamingUpdatePending.current) {
          streamingUpdatePending.current = true;
          setTimeout(() => {
            streamingUpdatePending.current = false;
            const currentId = streamingMessageIdRef.current;
            const currentText = streamingMessageRef.current;
            if (currentId) {
              setMessages(prev => prev.map(m =>
                m.id === currentId ? { ...m, text: currentText } : m
              ));
            }
            // Sync streaming text to native background overlay
            OverlayBridge.updateLastMessage(currentText);
          }, 50);
        }
        return;
      }

      if (data.type === 'AI_THOUGHT') {
        // Optionally log tool execution thoughts
        console.log(`[AI] Thought: ${data.content}`);
        return;
      }

      if (data.type === 'AI_COMPLETE') {
        setIsThinking(false);
        OverlayBridge.hideTypingIndicator();
        const finalText = streamingMessageRef.current;
        if (finalText) {
          // Parse sentiment
          let cleanMsg = finalText;
          let sentimentFace: any = 'Speaking';
          const sentimentMatch = finalText.match(/\[SENTIMENT:(\w+)\]/);
          if (sentimentMatch) {
            const s = sentimentMatch[1].toUpperCase();
            if (s === 'HAPPY') sentimentFace = 'Happy';
            else if (s === 'THINKING') sentimentFace = 'Thinking';
            else if (s === 'ALERT') sentimentFace = 'Alert';
            else if (s === 'QUESTION') sentimentFace = 'Question';
            else if (s === 'SAD') sentimentFace = 'Idle';
            cleanMsg = finalText.replace(/\[SENTIMENT:\w+\]/g, '').trim();
          }

          // Update the streaming bubble with the final cleaned text
          const currentId = streamingMessageIdRef.current;
          if (currentId) {
            setMessages(prev => prev.map(m =>
              m.id === currentId ? { ...m, text: cleanMsg, isComplete: true } : m
            ));
          }

          setFaceState(sentimentFace);
          OverlayBridge.updateState(sentimentFace);
          // Push final cleaned text directly to native overlay
          OverlayBridge.updateLastMessage(cleanMsg);
          playTTS(cleanMsg, settings.voiceId);

          setTimeout(() => {
            setFaceState('Idle');
            OverlayBridge.updateState('Idle');
          }, 5000);
        } else {
          setFaceState('Idle');
          OverlayBridge.updateState('Idle');
        }
        streamingMessageRef.current = '';
        streamingMessageIdRef.current = '';
        return;
      }

      if (data.type === 'ERROR') {
        setIsThinking(false);
        OverlayBridge.hideTypingIndicator();
        setFaceState('Idle');
        OverlayBridge.updateState('Idle');
        addMessage(data.message || "Sorry, something went wrong.", 'ai');
        streamingMessageRef.current = '';
        streamingMessageIdRef.current = '';
        return;
      }

      if (data.type === 'CLIENT_ACTION' && data.result?.clientAction) {
        console.log(`[FloatingAssistant] Async device action received: ${data.result.clientAction}`);
        
        if (data.result.clientAction === 'RENDER_IMAGE' && data.result.payload?.image) {
          if (data.result.actionId) {
            if (executedUIEventIds.has(data.result.actionId)) return;
            executedUIEventIds.add(data.result.actionId);
          }

          const imgBase64 = data.result.payload.image;
          const formattedB64 = imgBase64.startsWith('data:') ? imgBase64 : `data:image/jpeg;base64,${imgBase64}`;
          addMessage(formattedB64, 'ai', true);
          setIsExpanded(true); // Pop open the assistant panel to show the generated image
          setFaceState('Idle');
          OverlayBridge.updateState('Idle');
        } else {
          handleClientAction(data.result);
        }
      }
    });

    const askSub = DeviceEventEmitter.addListener('BACKGROUND_ASK_SORA', () => {
      // Background trigger from dynamic island or notification
      // Should now trigger the NATIVE recording via a bridge call if we want consistency, 
      // but OverlayService.kt already handles its own buttons. 
      // This listener is for when JS wants to trigger a background ask.
      OverlayBridge.updateState('Listening'); // Keep UI in sync
    });

    const seeSub = DeviceEventEmitter.addListener('BACKGROUND_SEE_SCREEN', () => {
      setTimeout(() => handleVisionPress(), 0);
    });

    return () => {
      alertSub.remove();
      screenshotSub.remove();
      screenshotErrorSub.remove();
      askSub.remove();
      seeSub.remove();
      overlayActionSub.remove();
      nativeMicClickSub.remove();
      liveStartReqSub.remove();
      liveEndReqSub.remove();
      wsDeviceActionSub.remove();
      recordingFinishedSub.remove();
      recordingErrorSub.remove();
      pcmSub.remove();
      liveAudioOutSub.remove();
      liveEndedSub.remove();
    };
  }, []); 

  const processAudioFile = async (uri: string) => {
    isProcessingMic.current = true;
    setFaceState('Thinking');
    OverlayBridge.updateState('Thinking');

    try {
      const token = await getAccessToken();
      const baseUrl = DEFAULT_BASE_URL;
      
      // Construct full upload URL
      const uploadUrl = baseUrl.startsWith('http') 
        ? `${baseUrl}/api/voice/transcribe` 
        : `http://${baseUrl}:3000/api/voice/transcribe`;

      console.log(`[Mic] Sending native recording to ${uploadUrl} via uploadAsync...`);
      
      const uploadRes = await FileSystem.uploadAsync(uploadUrl, uri, {
        fieldName: 'audio',
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (uploadRes.status !== 200 && uploadRes.status !== 201) {
        throw new Error(`Upload failed with status ${uploadRes.status}: ${uploadRes.body}`);
      }

      const resData = JSON.parse(uploadRes.body);
      const transcript = resData?.data?.text;
      
      console.log(`[Mic] Received transcript: "${transcript}"`);
      if (transcript) {
        // SMART VISION ALGORITHM
        // Check if the user is asking about the screen
        const visionKeywords = ['screen', 'summarize', 'see', 'show', 'look', 'what is on', 'whats on'];
        const isVisionRequest = visionKeywords.some(k => transcript.toLowerCase().includes(k));
        
        if (isVisionRequest) {
          console.log(`[Mic] Vision keyword detected in transcript. Triggering smart capture...`);
          // Store transcript for when the screenshot event arrives
          pendingVisionTranscriptRef.current = transcript;
          
          const isInForeground = AppState.currentState === 'active';
          if (isInForeground) {
            DeviceEventEmitter.emit('REQUEST_SCREENSHOT');
          } else {
            // SYNC transcript to native side before capture in case of relaunch or already active service
            OverlayBridge.updateState('Thinking'); 
            OverlayBridge.setVisionTranscript(transcript);
            OverlayBridge.takeScreenshot();
          }
        } else {
          await handleAiRequest(transcript);
        }
      } else {
        console.warn(`[Mic] No transcript returned.`);
        setFaceState('Idle');
        OverlayBridge.updateState('Idle');
      }
    } catch (err: any) {
      console.error("[Mic] Error processing native audio:", err.message);
      addMessage(`Mic Error: ${err.message}`, 'ai');
      setFaceState('Idle');
      OverlayBridge.updateState('Idle');
    } finally {
      isProcessingMic.current = false;
    }
  };

  const handleVisionCaptureResult = async (base64: string) => {
    setIsCapturing(false);
    // Strip data URI prefix if present (react-native-view-shot sometimes includes it)
    const cleanBase64 = base64.includes('base64,')
      ? base64.split('base64,')[1]
      : base64;
    console.log(`[Vision] Captured screenshot, base64 length: ${cleanBase64.length}`);
    await handleAiRequest("What's on my screen right now? Describe what you see.", cleanBase64);
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value }
    ],
  }));

  useEffect(() => {
    OverlayBridge.updateState(faceState);
  }, [faceState]);

  const handlePress = () => {
    setIsExpanded((prev) => !prev);
  };

  const handleLongPress = () => {
    setFaceState('Listening');
    setIsExpanded(true);
  };

  // ─── AI & Audio Logic ──────────────────────────────────────────────────────
  const getBase64 = async (blob: Blob): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  };

  const playTTS = async (text: string, voiceId?: string) => {
    // Wrap in setImmediate to ensure expo-av runs on main thread without being frozen by background timers
    setImmediate(async () => {
      try {
        const response = await apiClient.post('/voice/synthesize',
          { text, voiceId },
          { responseType: 'arraybuffer' }
        );

        const base64data = Platform.OS === 'web'
          ? btoa(new Uint8Array(response.data).reduce((s, b) => s + String.fromCharCode(b), ''))
          : require('buffer').Buffer.from(response.data, 'binary').toString('base64');

        const fileUri = FileSystem.documentDirectory + `tts_${Date.now()}.mp3`;
        await FileSystem.writeAsStringAsync(fileUri, base64data, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const { sound } = await Audio.Sound.createAsync(
          { uri: fileUri },
          { shouldPlay: true }
        );

        sound.setOnPlaybackStatusUpdate((playbackStatus) => {
          if (playbackStatus.isLoaded && playbackStatus.didJustFinish) {
            sound.unloadAsync();
            FileSystem.deleteAsync(fileUri, { idempotent: true });
          }
        });
      } catch (err) {
        console.error("TTS Playback Error:", err);
      }
    });
  };

  const handleAiRequest = async (text: string, imageBase64?: string) => {
    console.log(`[AI] Requesting response for: "${text}"`);
    setFaceState('Thinking');
    setIsThinking(true);
    addMessage(text, 'user');
    OverlayBridge.showTypingIndicator();

    // Build context from previous messages
    const chatContext = messagesRef.current
      .slice(-10)
      .map(m => ({
        role: m.sender === 'ai' ? 'assistant' : 'user',
        content: m.text,
        image: m.imageBase64
      }));

    // Try Socket.IO streaming first, fall back to HTTP
    const socketSent = emitAiChat({
      message: text,
      context: chatContext,
      image: imageBase64,
      voiceId: settings.voiceId,
      conversationId: conversationId,
    });

    if (socketSent) {
      // Socket.IO streaming mode — create an empty AI bubble that will be filled by WS_EVENT tokens
      const streamId = Date.now().toString() + Math.random();
      streamingMessageRef.current = '';
      streamingMessageIdRef.current = streamId;
      setMessages(prev => [...prev, { id: streamId, text: '', sender: 'ai', isComplete: false }]);
      setIsThinking(false); // We have the bubble now, dots aren't needed — tokens will fill it
      OverlayBridge.hideTypingIndicator();
      // Add an empty AI bubble to the native overlay so updateLastMessage has a target
      OverlayBridge.addMessage('⏳', 'ai');
      return;
    }

    // ─── HTTP Fallback (Socket.IO not connected) ────────────────────────────
    console.warn('[AI] Socket.IO not connected, falling back to HTTP');
    try {
      const response = await apiClient.post('/ai/chat', {
        message: text,
        context: chatContext,
        image: imageBase64,
        conversationId: conversationId
      });

      console.log(`[AI] Response received from server`);
      const aiData = response.data.data;
      console.log(`[AI] aiData keys: ${Object.keys(aiData || {}).join(', ')}`);
      console.log(`[AI] aiData.message: ${(aiData?.message || '').substring(0, 50)}`);
      let aiMsg = aiData.message || (aiData.type === 'ACTION_RESULT' ? aiData.result?.message : "Success.");

      // Process device actions (only via HTTP fallback path)
      const processAction = (action: any) => {
        if (!action) return;
        if (action.clientAction === 'RENDER_IMAGE' && action.payload?.image) {
          if (action.actionId) {
            if (executedUIEventIds.has(action.actionId)) return;
            executedUIEventIds.add(action.actionId);
          }

          const imgBase64 = action.payload.image;
          const formattedB64 = imgBase64.startsWith('data:') ? imgBase64 : `data:image/jpeg;base64,${imgBase64}`;
          addMessage(formattedB64, 'ai', true);
          setIsExpanded(true);
          setFaceState('Idle');
          OverlayBridge.updateState('Idle');
        } else {
          handleClientAction(action);
        }
      };

      const clientResult = aiData.result?.clientAction ? aiData.result : (aiData.clientAction ? aiData : null);
      if (clientResult) {
        console.log(`[AI] Executing client action: ${clientResult.clientAction}`);
        processAction(clientResult);
      }
      if (aiData.clientActions && Array.isArray(aiData.clientActions)) {
        for (const action of aiData.clientActions) {
          console.log(`[AI] Executing array client action: ${action.clientAction}`);
          processAction(action);
        }
      }

      if (aiMsg) {
        // Sentiment Parsing (e.g., [SENTIMENT:HAPPY])
        const sentimentMatch = aiMsg.match(/\[SENTIMENT:(\w+)\]/);
        let sentimentFace: AssistantFaceState = 'Speaking';

        if (sentimentMatch) {
          const s = sentimentMatch[1].toUpperCase();
          if (s === 'HAPPY') sentimentFace = 'Happy';
          else if (s === 'THINKING') sentimentFace = 'Thinking';
          else if (s === 'ALERT') sentimentFace = 'Alert';
          else if (s === 'QUESTION') sentimentFace = 'Question';
          else if (s === 'SAD') sentimentFace = 'Idle';

          aiMsg = aiMsg.replace(/\[SENTIMENT:\w+\]/g, '').trim();
        }

        addMessage(aiMsg, 'ai');
        OverlayBridge.hideTypingIndicator();

        setFaceState(sentimentFace);
        await playTTS(aiMsg, settings.voiceId);

        // Revert to Idle after a delay to let the emotion sink in
        setTimeout(() => {
          setFaceState('Idle');
          OverlayBridge.updateState('Idle');
        }, 5000);
      }
    } catch (err: any) {
      console.error('AI Request error:', err?.response?.data || err.message);
      const errMsg = "Sorry, I'm having trouble connecting.";
      addMessage(errMsg, 'ai');
      OverlayBridge.hideTypingIndicator();
      setFaceState('Idle');
      OverlayBridge.updateState('Idle');
    } finally {
      setIsThinking(false);
    }
  };

  const handleMicPress = async () => {
    if (isProcessingMic.current) {
        console.log('[Mic] Mic action already in progress, ignoring...');
        return;
    }
    
    // Use refs for closure-safe access (these always have current values, unlike state in stale closures)
    const currentlyListening = isListeningRef.current;
    const currentRecording = recordingRef.current;
    
    console.log(`[Mic] Button pressed. isListening: ${currentlyListening}, hasRecording: ${!!currentRecording}`);
    if (currentlyListening && currentRecording) {
      if (backgroundRecordingTimer.current) {
        clearTimeout(backgroundRecordingTimer.current);
        backgroundRecordingTimer.current = null;
      }
      isProcessingMic.current = true;
      setIsListening(false);
      isListeningRef.current = false;
      setFaceState('Thinking');
      OverlayBridge.updateState('Thinking');
      console.log(`[Mic] Stopping recording...`);

      try {
        await currentRecording.stopAndUnloadAsync();
        const uri = currentRecording.getURI();
        console.log(`[Mic] Recording saved to: ${uri}`);
        setRecording(null);
        recordingRef.current = null;

        if (!uri) throw new Error("No audio URI");

        const formData = new FormData();
        formData.append('audio', {
          uri: Platform.OS === 'android' ? uri : uri.replace('file://', ''),
          name: 'audio.m4a',
          type: 'audio/m4a'
        } as any);

        console.log(`[Mic] Sending transcription request to backend...`);
        const uploadRes = await apiClient.post('/voice/transcribe', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });

        const transcript = uploadRes.data?.data?.text;
        console.log(`[Mic] Received transcript: "${transcript}"`);
        if (transcript) {
          await handleAiRequest(transcript);
        } else {
          console.warn(`[Mic] No transcript returned from server.`);
          setFaceState('Idle');
        }
        // Restart silence loop after recording finishes
        await startBackgroundSilence();
      } catch (err: any) {
        console.error("[Mic] Error during transcription:", err.response?.data || err.message);
        setFaceState('Idle');
        await startBackgroundSilence();
      } finally {
        isProcessingMic.current = false;
      }
    } else {
      try {
        isProcessingMic.current = true;
        console.log(`[Mic] Checking existing permissions...`);
        const existingPerm = await Audio.getPermissionsAsync();
        console.log(`[Mic] Existing permission status: ${existingPerm.status}`);
        
        if (existingPerm.status !== 'granted') {
          console.log(`[Mic] Requesting permissions...`);
          const perm = await Audio.requestPermissionsAsync();
          console.log(`[Mic] New permission status: ${perm.status}`);
          if (perm.status !== 'granted') return;
        }

        // Release audio focus before recording
        await stopBackgroundSilence();
        
        // Ensure native side upgrades to MICROPHONE type
        await new Promise(resolve => setTimeout(resolve, 500));
        console.log(`[Mic] Setting state to Listening...`);

        // CRITICAL: Set state to Listening BEFORE creating the recording
        // This ensures the native foreground service type is upgraded in time for Android 14
        setFaceState('Listening');
        OverlayBridge.updateState('Listening');
        setIsListening(true);
        isListeningRef.current = true;

        // Create recording (we must swallow keep-awake errors in background)
        try {
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: true,
            staysActiveInBackground: true, // True to prevent background suspension
            playsInSilentModeIOS: true,
            shouldDuckAndroid: true,
          });
        } catch (modeErr: any) {
          console.warn('[Mic] setAudioModeAsync error ignored:', modeErr.message);
        }

        console.log(`[Mic] Starting high-quality recording with Whisper preset...`);
        const { recording: newRec } = await Audio.Recording.createAsync(
          WHISPER_PRESET
        );
        setRecording(newRec);
        recordingRef.current = newRec;

        // Auto-stop after 10 seconds to prevent recording indefinitely in background
        backgroundRecordingTimer.current = setTimeout(() => {
          console.log('[Mic] Background timeout reached, auto-stopping...');
          handleMicPress(); // Trigger stop — this now correctly reads refs
        }, 10000);

        console.log(`[Mic] Recording active.`);
      } catch (err) {
        console.error("[Mic] Recording start error:", err);
        setFaceState('Idle');
        OverlayBridge.updateState('Idle');
      } finally {
        isProcessingMic.current = false;
      }
    }
  };

  const handleMicLongPress = async () => {
    if (isLiveModeRef.current) {
      // Toggle off Live Mode
      setIsLiveMode(false);
      isLiveModeRef.current = false;
      OverlayBridge.stopPCMStreaming();
      emitLiveStop();
      setFaceState('Idle');
      OverlayBridge.updateState('Idle');
      startBackgroundSilence();
      return;
    }

    // Toggle on Live Mode
    if (isListeningRef.current) {
      setIsListening(false);
      isListeningRef.current = false;
    }

    try {
      await stopBackgroundSilence();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    } catch { }

    setIsLiveMode(true);
    isLiveModeRef.current = true;
    setIsExpanded(true);
    setFaceState('Listening');
    OverlayBridge.updateState('Listening');

    const sessionStarted = emitLiveStart();
    if (!sessionStarted) {
      addMessage('Could not connect to Gemini Live. Server unreachable.', 'ai');
      setIsLiveMode(false);
      isLiveModeRef.current = false;
      setFaceState('Idle');
      OverlayBridge.updateState('Idle');
      return;
    }

    OverlayBridge.startPCMStreaming();
    console.log('[Live] Native PCM Streaming initiated');
  };

  const playLiveAudioChunk = async (base64data: string) => {
    try {
      if (!isLiveModeRef.current) return;
      const fileUri = FileSystem.documentDirectory + `live_${Date.now()}_${Math.random().toString().substring(2)}.mp3`;
      await FileSystem.writeAsStringAsync(fileUri, base64data, { encoding: FileSystem.EncodingType.Base64 });
      const { sound } = await Audio.Sound.createAsync({ uri: fileUri }, { shouldPlay: true });
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync();
          FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
        }
      });
    } catch (e) {
      console.error('[Live] Error playing audio chunk:', e);
    }
  };

  const handleVisionPress = () => {
    console.log('[Vision] Vision button pressed');
    setIsCapturing(true);
    setFaceState('Thinking');
    OverlayBridge.updateState('Thinking');

    // Use different capture paths depending on app state:
    // - Foreground: ViewShot (captureRef) — fast, no permission needed
    // - Background: Native MediaProjection — captures actual screen
    // FORCE NATIVE if we suspect background issues or user requested system-wide
    const isInForeground = AppState.currentState === 'active';
    console.log(`[Vision] App foreground status: ${isInForeground}`);

    try {
        if (isInForeground) {
          console.log('[Vision] App in foreground, using internal ViewShot capture');
          DeviceEventEmitter.emit('REQUEST_SCREENSHOT');
        } else {
          console.log('[Vision] App in background, triggering native system-wide screenshot');
          // If manual vision press, we don't have a transcript, so clear native one
          OverlayBridge.setVisionTranscript(null);
          OverlayBridge.updateState('Thinking'); 
          OverlayBridge.takeScreenshot();
        }
    } catch (err: any) {
        console.error(`[Vision] Direct capture trigger failed: ${err.message}`);
        setIsCapturing(false);
        setFaceState('Idle');
    }

    // Set a 15-second safety timeout for vision capture
    if (visionTimeoutRef.current) clearTimeout(visionTimeoutRef.current);
    visionTimeoutRef.current = setTimeout(() => {
      if (isCapturingRef.current) {
        console.warn('[Vision] Capture timed out after 15s. Resetting state...');
        setIsCapturing(false);
        setFaceState('Idle');
        OverlayBridge.resetVisionCapture();
      }
    }, 15000);
  };


  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <DynamicIsland
        state={faceState}
        isExpanded={isExpanded}
        isHalfScreen={isHalfScreen}
        isEmpty={messages.length === 0}
        activeTimer={activeTimer}
        eyeColor={settings.eyeColor}
        onPress={handlePress}
        onLongPress={handleLongPress}
        onTripleTap={handleTripleTap}
      >
        {showNotes ? (
          <View style={{ flex: 1, padding: 10 }}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 10 }}>Your Notes</Text>
            {/* Mock Notes for now */}
            <Text style={{ color: '#0df' }}>• Buy groceries</Text>
            <Text style={{ color: '#0df' }}>• Call Mom</Text>
            <Text style={{ color: '#0df' }}>• Finish AI Project</Text>
          </View>
        ) : (
          <MiniChatPanel
            messages={messages}
            utilityEvents={utilityEvents}
            isListening={isListening}
            isCapturing={isCapturing}
            isHalfScreen={isHalfScreen}
            isLiveMode={isLiveMode}
            isThinking={isThinking}
            onMicPress={handleMicPress}
            onMicLongPress={handleMicLongPress}
            onVisionPress={handleVisionPress}
            onToggleSize={handleToggleSize}
            onRetract={handlePress}
            onSendText={(text) => handleAiRequest(text)}
          />
        )}
      </DynamicIsland>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 5, // Adjusted upward for closer alignment to camera notch
    alignSelf: 'center',
    zIndex: 9999,
    elevation: 100,
  }
});
