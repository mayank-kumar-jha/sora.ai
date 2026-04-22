'use strict';

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const logger = require('../config/logger');
const prisma = require('../config/database');
const aiService = require('./aiService');

let io;
const userSockets = new Map(); // userId → Set<socket>

/**
 * Initialize Socket.io server on top of the HTTP server.
 */
const initSocketIO = (httpServer) => {
  io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    pingInterval: 600000, // 10 minutes
    pingTimeout: 300000,  // 5 minutes
  });

  if (config.redis.url) {
    try {
      const { createAdapter } = require('@socket.io/redis-adapter');
      const Redis = require('ioredis');
      const pubClient = new Redis(config.redis.url);
      const subClient = pubClient.duplicate();
      io.adapter(createAdapter(pubClient, subClient));
      logger.info('[Socket.io] Redis Adapter configured successfully');
    } catch (err) {
      logger.warn(`[Socket.io] Redis Adapter failed to attach: ${err.message}`);
    }
  }

  // JWT Authentication middleware
  io.use((socket, next) => {
    // Allow local system services (like Wake Word Python script) to connect
    if (socket.handshake.query?.system === 'wakeword') {
      socket.userId = 'system-wakeword';
      socket.userEmail = 'system@localhost';
      return next();
    }

    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('Authentication required'));

    try {
      const decoded = jwt.verify(token, config.jwt.secret);
      socket.userId = decoded.sub || decoded.id;
      socket.userEmail = decoded.email;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.userId;
    logger.info(`[Socket.io] Connected: ${userId}`);

    // Track connection
    if (!userSockets.has(userId)) userSockets.set(userId, new Set());
    userSockets.get(userId).add(socket);

    // ─── AI Chat (streaming) ───────────────────────────────────────────
    socket.on('ai:chat', (payload) => handleAiChat(socket, payload));

    // ─── Gemini Live (continuous talking) ────────────────────────────────
    socket.on('live:start', async () => {
      try {
        const geminiLive = require('./geminiLiveService');
        await geminiLive.startSession(userId, {
          onAudioOut: (audioBase64) => {
            if (socket.connected) socket.emit('live:audio_out', { audio: audioBase64 });
          },
          onText: (text) => {
            if (socket.connected) socket.emit('live:text', { text });
          },
          onError: (msg) => {
            if (socket.connected) socket.emit('live:error', { message: msg });
          },
          onEnd: () => {
            if (socket.connected) socket.emit('live:ended');
          },
        });
        socket.emit('live:started');
        logger.info(`[Socket.io] Gemini Live session started for ${userId}`);
      } catch (err) {
        logger.error(`[Socket.io] Live start failed: ${err.message}`);
        socket.emit('live:error', { message: err.message });
      }
    });

    socket.on('live:audio', (data) => {
      const geminiLive = require('./geminiLiveService');
      geminiLive.sendAudio(userId, data.audio);
    });

    socket.on('live:stop', async () => {
      const geminiLive = require('./geminiLiveService');
      geminiLive.endSession(userId);
      logger.info(`[Socket.io] Gemini Live session stopped by ${userId}`);
    });

    // ─── Wake Word (openWakeWord Python service) ─────────────────────
    socket.on('wake_word:audio', (data) => {
      // Forward PCM audio to all connected wake word services
      io.emit('wake_word:audio', data);
    });

    socket.on('wake_word:register', (data) => {
      logger.info(`[Socket.io] Wake word service registered: ${data?.service || 'unknown'}`);
    });

    let lastWakeWordDetection = 0; // debounce wake word server-side
    socket.on('wake_word:detected', (data) => {
      const now = Date.now();
      if (now - lastWakeWordDetection < 3000) {
        logger.info(`[Socket.io] Wake word debounced (${now - lastWakeWordDetection}ms since last)`);
        return;
      }
      lastWakeWordDetection = now;
      logger.info(`[Socket.io] Wake word detected! Score: ${data?.score}`);
      // Broadcast to ALL connected user sockets (not the system-wakeword socket)
      userSockets.forEach((socketSet, uid) => {
        if (uid === 'system-wakeword') return; // Skip the Python service itself
        socketSet.forEach((s) => {
          if (s.connected) s.emit('device:action', { clientAction: 'WAKE_WORD_DETECTED', ...data });
        });
      });
    });

    // ─── Disconnect ────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      userSockets.get(userId)?.delete(socket);
      if (userSockets.get(userId)?.size === 0) userSockets.delete(userId);

      logger.info(`[Socket.io] Disconnected: ${userId}`);
    });
  });

  logger.info('[Socket.io] Server initialized');
  return io;
};

/**
 * Stop the live session.
 */
const handleLiveStop = async (socket) => {
  const geminiLive = require('./geminiLiveService');
  const sessionId = geminiLive.getSessionForUser(socket.userId);
  if (sessionId) {
    await geminiLive.endSession(sessionId);
    logger.info(`[Socket.io] Live session stopped by user: ${socket.userId}`);
  }
};

/**
 * Handle AI chat — streams tokens and TTS audio to the client.
 */
const handleAiChat = async (socket, payload) => {
  const { message, context = [], image, voiceId, conversationId } = payload || {};
  const userId = socket.userId;

  if (!message) {
    socket.emit('ai:error', { message: 'Message is required' });
    return;
  }

  let fullResponse = '';
  let sentenceBuffer = '';

  try {
    const stream = aiService.streamGemini(userId, message, context, image);

    for await (const chunk of stream) {
      if (chunk.type === 'THOUGHT') {
        socket.emit('ai:thought', { content: chunk.text });
        continue;
      }

      if (chunk.type === 'CLIENT_ACTION') {
        // Forward device actions directly to the socket (image renders, WhatsApp, etc.)
        if (socket.connected) socket.emit('device:action', chunk.result);
        continue;
      }

      const token = chunk.text;
      if (!token) continue;
      fullResponse += token;
      sentenceBuffer += token;

      // Send token immediately for live text rendering
      socket.emit('ai:token', { content: token });

      // Once we have a complete sentence, trigger TTS in background
      if (/[.!?]\s*$/.test(sentenceBuffer) && sentenceBuffer.trim().length > 15) {
        const sentence = sentenceBuffer.trim();
        sentenceBuffer = '';
        generateAndSendTTS(socket, sentence, voiceId);
      }
    }

    // Handle remaining text in buffer
    if (sentenceBuffer.trim().length > 0) {
      generateAndSendTTS(socket, sentenceBuffer.trim(), voiceId);
    }

    socket.emit('ai:complete', {});

    // Save conversation to DB in background, but only if it's a real UUID (prevent test script crashes)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(userId)) {
      prisma.conversation.create({
        data: { userId, conversationId: conversationId || null, role: 'ASSISTANT', message: fullResponse || '[No response]' },
      }).catch((err) => logger.error(`[Socket.io] Failed to save AI response: ${err.message}`));
    } else {
      logger.info(`[Socket.io] Skipping conversation save for mock user: ${userId}`);
    }
  } catch (err) {
    logger.error(`[Socket.io] AI chat error: ${err.message}`);
    socket.emit('ai:error', { message: err.message });
  }
};

/**
 * Generate TTS audio and send to socket (fire-and-forget).
 */
const generateAndSendTTS = async (socket, text, voiceId) => {
  try {
    const voiceService = require('./voiceService');
    const audioBuffer = await voiceService.synthesize(text, voiceId);
    if (socket.connected) {
      socket.emit('ai:audio', { payload: audioBuffer.toString('base64'), text });
    }
  } catch (err) {
    logger.warn(`[Socket.io] TTS failed: ${err.message}`);
  }
};

/**
 * Send an event to all sockets of a specific user.
 */
const notifyUser = (userId, event, data) => {
  if (userId === 'system') {
    // Broadcast to ALL connected users
    if (io) io.emit(event, data);
    return;
  }

  const sockets = userSockets.get(userId);
  if (!sockets) return;
  sockets.forEach((s) => {
    if (s.connected) s.emit(event, data);
  });
};

/**
 * Get the Socket.io instance.
 */
const getIO = () => io;

module.exports = { initSocketIO, notifyUser, getIO };
