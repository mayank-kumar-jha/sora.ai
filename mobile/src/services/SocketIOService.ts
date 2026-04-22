/**
 * SocketIOService — Socket.IO client for Kaaya backend
 * Manages connection, authentication, reconnection, and event routing.
 * Replaces raw WebSocket for structured communication.
 */
import { io, Socket } from 'socket.io-client';
import { DeviceEventEmitter } from 'react-native';
import { getAccessToken, getServerUrl } from '../utils/storage';
import { DEFAULT_BASE_URL } from '../constants/settings';

let socket: Socket | null = null;
let isConnecting = false;

// ─── Connection ────────────────────────────────────────────────────────────

export const connectSocketIO = async (): Promise<Socket | null> => {
  if (isConnecting || (socket && socket.connected)) {
    return socket;
  }

  const token = await getAccessToken();
  if (!token) {
    console.warn('[SocketIO] No auth token available yet, skipping connection');
    isConnecting = false;
    return null;
  }

  isConnecting = true;
  let customUrl = await getServerUrl();
  if (customUrl && customUrl.includes('render.com')) {
      customUrl = null; // Auto-fix cached prod URLs
  }
  
  // FORCED FIX: Ignore customUrl completely to ensure it uses the ADB USB tunnel (127.0.0.1)
  const baseUrl = DEFAULT_BASE_URL;
  console.log(`[SocketIO] Connecting to: ${baseUrl} (token: ${token.substring(0, 8)}...)`);

  try {
    // Disconnect old socket if exists
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
      socket = null;
    }

    socket = io(baseUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 15000,
      reconnectionAttempts: Infinity,
      timeout: 10000,
    });

    socket.on('connect', () => {
      isConnecting = false;
      console.log('[SocketIO] Connected:', socket?.id);
      DeviceEventEmitter.emit('SOCKETIO_CONNECTED');
    });

    socket.on('disconnect', (reason) => {
      console.log('[SocketIO] Disconnected:', reason);
      DeviceEventEmitter.emit('SOCKETIO_DISCONNECTED', { reason });
    });

    socket.on('connect_error', (err) => {
      isConnecting = false;
      console.error('[SocketIO] Connection error:', err.message);
    });

    // ─── AI Chat Events ─────────────────────────────────────────────
    socket.on('ai:token', (data) => {
      DeviceEventEmitter.emit('WS_EVENT', { type: 'AI_TOKEN', content: data.content });
    });

    socket.on('ai:thought', (data) => {
      DeviceEventEmitter.emit('WS_EVENT', { type: 'AI_THOUGHT', content: data.content });
    });

    socket.on('ai:audio', (data) => {
      DeviceEventEmitter.emit('WS_EVENT', { type: 'AI_AUDIO', payload: data.payload, text: data.text });
    });

    socket.on('ai:complete', () => {
      DeviceEventEmitter.emit('WS_EVENT', { type: 'AI_COMPLETE' });
    });

    socket.on('ai:error', (data) => {
      DeviceEventEmitter.emit('WS_EVENT', { type: 'ERROR', message: data.message });
    });


    // ─── Device Actions (e.g., WhatsApp, Alarm) ─────────────────────
    socket.on('device:action', (data) => {
      DeviceEventEmitter.emit('WS_EVENT', { type: 'CLIENT_ACTION', result: data });
    });

    socket.on('whatsapp:message', (data) => {
      DeviceEventEmitter.emit('WS_EVENT', { type: 'WHATSAPP_MESSAGE', result: data });
    });

    // ─── Gemini Live Events ──────────────────────────────────────────
    socket.on('live:started', () => {
      DeviceEventEmitter.emit('LIVE_SESSION_STARTED');
    });

    socket.on('live:audio_out', (data) => {
      DeviceEventEmitter.emit('LIVE_AUDIO_OUT', { audio: data.audio });
    });

    socket.on('live:text', (data) => {
      DeviceEventEmitter.emit('LIVE_TEXT', { text: data.text });
    });

    socket.on('live:error', (data) => {
      DeviceEventEmitter.emit('LIVE_ERROR', { message: data.message });
    });

    socket.on('live:ended', () => {
      DeviceEventEmitter.emit('LIVE_SESSION_ENDED');
    });

    return socket;
  } catch (err) {
    isConnecting = false;
    console.error('[SocketIO] Failed to create socket:', err);
    return null;
  }
};

// ─── Getters ───────────────────────────────────────────────────────────────

export const getSocket = (): Socket | null => socket;

export const isSocketConnected = (): boolean => socket?.connected ?? false;

// ─── Emitters ──────────────────────────────────────────────────────────────

export const emitAiChat = (payload: {
  message: string;
  context?: any[];
  image?: string;
  voiceId?: string;
  conversationId?: string;
}): boolean => {
  if (!socket?.connected) return false;
  socket.emit('ai:chat', payload);
  return true;
};

// ─── Gemini Live Emitters ──────────────────────────────────────────────────

export const emitLiveStart = (): boolean => {
  if (!socket?.connected) return false;
  socket.emit('live:start');
  return true;
};

export const emitLiveAudio = (audioBase64: string): boolean => {
  if (!socket?.connected) return false;
  socket.emit('live:audio', { audio: audioBase64 });
  return true;
};

export const emitLiveStop = (): boolean => {
  if (!socket?.connected) return false;
  socket.emit('live:stop');
  return true;
};

// ─── Disconnect ────────────────────────────────────────────────────────────

export const disconnectSocketIO = () => {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  isConnecting = false;
};
