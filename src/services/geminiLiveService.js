'use strict';

const WebSocket = require('ws');
const config = require('../config/env');
const logger = require('../config/logger');

/**
 * Gemini Live Service
 * ===================
 * Manages real-time bidirectional audio sessions with Google's Gemini Live API.
 * Uses raw WebSocket (WSS) — no shared database, purely in-memory sessions.
 *
 * Protocol:
 *   - Input:  16-bit PCM, 16kHz, mono, little-endian (base64 encoded)
 *   - Output: 16-bit PCM, 24kHz, mono, little-endian (base64 encoded)
 */

const LIVE_WS_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
const LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';

// Active sessions: userId → { ws, socketCallback }
const sessions = new Map();

/**
 * Start a new Gemini Live session for a user.
 * @param {string} userId
 * @param {Function} onAudioOut - callback(base64AudioChunk) for outgoing audio
 * @param {Function} onText - callback(text) for text responses
 * @param {Function} onError - callback(errorMsg)
 * @param {Function} onEnd - callback() when session ends
 * @returns {Promise<string>} sessionId (same as userId for simplicity)
 */
const startSession = (userId, { onAudioOut, onText, onError, onEnd }) => {
  return new Promise((resolve, reject) => {
    // Close existing session if any
    if (sessions.has(userId)) {
      endSession(userId);
    }

    const apiKey = config.gemini.apiKey;
    if (!apiKey) {
      reject(new Error('GEMINI_API_KEY not configured'));
      return;
    }

    const wsUrl = `${LIVE_WS_URL}?key=${apiKey}`;
    logger.info(`[GeminiLive] Opening session for ${userId}`);

    const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
      logger.info(`[GeminiLive] WebSocket connected for ${userId}`);

      // Send setup message
      const setupMessage = {
        setup: {
          model: `models/${LIVE_MODEL}`,
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: 'Aoede'
                }
              }
            }
          },
          systemInstruction: {
            parts: [{
              text: `You are Kaaya, an ultra-smart AI assistant. You are speaking live with the user via voice. 
Be concise, natural, and helpful. Keep responses short and conversational. 
Address the user as "Sir" occasionally for a professional touch.
Current time: ${new Date().toString()}`
            }]
          }
        }
      };

      ws.send(JSON.stringify(setupMessage));

      sessions.set(userId, { ws, onAudioOut, onText, onError, onEnd });
      resolve(userId);
    });

    ws.on('message', (rawData) => {
      try {
        const msg = JSON.parse(rawData.toString());

        // Setup complete acknowledgment
        if (msg.setupComplete) {
          logger.info(`[GeminiLive] Setup complete for ${userId}`);
          return;
        }

        // Server content (audio or text)
        if (msg.serverContent) {
          const parts = msg.serverContent.modelTurn?.parts || [];
          for (const part of parts) {
            if (part.inlineData) {
              // Audio chunk
              const audioBase64 = part.inlineData.data;
              if (audioBase64 && onAudioOut) {
                onAudioOut(audioBase64);
              }
            }
            if (part.text && onText) {
              onText(part.text);
            }
          }

          // Check if turn is complete
          if (msg.serverContent.turnComplete) {
            logger.info(`[GeminiLive] Turn complete for ${userId}`);
          }
        }
      } catch (err) {
        logger.error(`[GeminiLive] Message parse error: ${err.message}`);
      }
    });

    ws.on('error', (err) => {
      logger.error(`[GeminiLive] WebSocket error for ${userId}: ${err.message}`);
      if (onError) onError(err.message);
      sessions.delete(userId);
    });

    ws.on('close', (code, reason) => {
      const reasonStr = reason ? reason.toString() : 'no reason';
      logger.info(`[GeminiLive] WebSocket closed for ${userId}: code=${code} reason="${reasonStr}"`);
      sessions.delete(userId);
      if (onEnd) onEnd();
    });
  });
};

/**
 * Send an audio chunk to the active Gemini Live session.
 * @param {string} userId
 * @param {string} audioBase64 - base64-encoded PCM16 audio
 */
const sendAudio = (userId, audioBase64) => {
  const session = sessions.get(userId);
  if (!session || session.ws.readyState !== WebSocket.OPEN) {
    return false;
  }

  const message = {
    realtimeInput: {
      mediaChunks: [{
        mimeType: 'audio/pcm;rate=16000',
        data: audioBase64
      }]
    }
  };

  session.ws.send(JSON.stringify(message));
  return true;
};

/**
 * End a Gemini Live session.
 * @param {string} userId
 */
const endSession = (userId) => {
  const session = sessions.get(userId);
  if (session) {
    logger.info(`[GeminiLive] Ending session for ${userId}`);
    try {
      if (session.ws.readyState === WebSocket.OPEN) {
        session.ws.close();
      }
    } catch (err) {
      logger.error(`[GeminiLive] Error closing session: ${err.message}`);
    }
    sessions.delete(userId);
  }
};

/**
 * Check if a user has an active session.
 */
const getSessionForUser = (userId) => {
  return sessions.has(userId) ? userId : null;
};

module.exports = { startSession, sendAudio, endSession, getSessionForUser };
