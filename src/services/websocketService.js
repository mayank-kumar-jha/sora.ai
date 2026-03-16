'use strict';

const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const aiService = require('./aiService');
const logger = require('../config/logger');

let wss;
const userConnections = new Map(); // userId -> Set of connections

const initAiWebSocket = (server) => {
    wss = new WebSocketServer({ server, path: '/ws' });

    // Send a JSON 'PING' every 20 seconds to keep mobile connections alive
    const pingInterval = setInterval(() => {
        wss.clients.forEach((ws) => {
            if (ws.readyState === 1) {
                ws.send(JSON.stringify({ type: 'PING' }));
            }
        });
    }, 20000);

    wss.on('close', () => {
        clearInterval(pingInterval);
    });

    wss.on('connection', async (ws, req) => {
        const host = req.headers.host || 'unknown-host';
        const url = new URL(req.url, `http://${host}`);
        if (host === 'host') logger.warn('DETECTED literal hostname "host" in request headers');
        const token = url.searchParams.get('token');

        if (!token) {
            ws.close(4001, 'Unauthorized: Token missing');
            return;
        }

        try {
            const decoded = jwt.verify(token, config.jwt.secret);
            const userId = decoded.sub || decoded.id;
            ws.userId = userId;

            // Store connection
            if (!userConnections.has(userId)) {
                userConnections.set(userId, new Set());
            }
            userConnections.get(userId).add(ws);

            logger.info(`WebSocket connected for user ${userId}`);

            ws.on('message', async (message) => {
                try {
                    const data = JSON.parse(message);
                    if (data.type === 'AI_CHAT') {
                        await handleAiChat(ws, data.payload);
                    }
                } catch (err) {
                    ws.send(JSON.stringify({ type: 'ERROR', message: 'Invalid message format' }));
                }
            });

            ws.on('close', () => {
                userConnections.get(userId).delete(ws);
                if (userConnections.get(userId).size === 0) {
                    userConnections.delete(userId);
                }
                logger.info(`WebSocket disconnected for user ${userId}`);
            });

        } catch (err) {
            ws.close(4002, 'Unauthorized: Invalid token');
        }
    });

    return wss;
};

const geminiAgentService = require('./geminiAgentService');
const deepgramService = require('./deepgramService');
const { v4: uuidv4 } = require('uuid');

const handleAiChat = async (ws, payload) => {
    const { message, context = [], image, voiceId = 'aura-asteria-en', conversationId } = payload;
    const userId = ws.userId;
    let fullResponse = '';
    let sentenceBuffer = '';

    try {
        const stream = await geminiAgentService.streamMessageWithTools(userId, message, context, image);

        for await (const chunk of stream) {
            if (chunk.type === 'THOUGHT') {
                ws.send(JSON.stringify({ type: 'AI_THOUGHT', content: chunk.text }));
                continue;
            }

            const token = chunk.text;
            fullResponse += token;
            sentenceBuffer += token;
            
            // Send token to UI immediately
            ws.send(JSON.stringify({ type: 'AI_TOKEN', content: token }));

            // If we have a complete sentence, trigger TTS in parallel
            if (/[.!?]\s*$/.test(sentenceBuffer) && sentenceBuffer.trim().length > 15) {
                const sentenceToSpeak = sentenceBuffer.trim();
                sentenceBuffer = ''; // Reset buffer for next sentence

                // Generate TTS in background and push to client as soon as ready
                (async () => {
                    try {
                        const audioBuffer = await deepgramService.synthesizeSpeech(sentenceToSpeak, voiceId);
                        if (ws.readyState === 1) {
                            ws.send(JSON.stringify({
                                type: 'AI_AUDIO',
                                payload: audioBuffer.toString('base64'),
                                text: sentenceToSpeak
                            }));
                        }
                    } catch (ttsErr) {
                        logger.warn(`Background TTS failed for sentence: ${ttsErr.message}`);
                    }
                })();
            }
        }

        // Handle any remaining text in the buffer
        if (sentenceBuffer.trim().length > 0) {
            const sentenceToSpeak = sentenceBuffer.trim();
            (async () => {
                try {
                    const audioBuffer = await deepgramService.synthesizeSpeech(sentenceToSpeak, voiceId);
                    if (ws.readyState === 1) {
                        ws.send(JSON.stringify({
                            type: 'AI_AUDIO',
                            payload: audioBuffer.toString('base64'),
                            text: sentenceToSpeak
                        }));
                    }
                } catch (ttsErr) {
                    logger.warn(`Background TTS remaining failed: ${ttsErr.message}`);
                }
            })();
        }

        ws.send(JSON.stringify({ type: 'AI_COMPLETE' }));

        // Save AI response to database in background
        prisma.conversation.create({
            data: {
                userId,
                conversationId: conversationId || null,
                role: 'ASSISTANT',
                message: fullResponse || '[Action Executed]'
            }
        }).catch(err => logger.error(`Failed to save AI response to DB: ${err.message}`));

    } catch (err) {
        logger.error(`WebSocket AI Chat Error: ${err.message}`);
        ws.send(JSON.stringify({ type: 'ERROR', message: err.message }));
    }
};

/**
 * Send event to all connections of a specific user
 */
const notifyUser = (userId, type, payload) => {
    const message = JSON.stringify({ type, payload });

    // If it's a system broadcast (e.g., incoming WhatsApp), send to everyone
    if (userId === 'system') {
        userConnections.forEach((connections) => {
            connections.forEach(ws => {
                if (ws.readyState === 1) { // OPEN
                    ws.send(message);
                }
            });
        });
        return;
    }

    // Otherwise send strictly to the specific user session
    const connections = userConnections.get(userId);
    if (!connections) return;

    connections.forEach(ws => {
        if (ws.readyState === 1) { // OPEN
            ws.send(message);
        }
    });
};

module.exports = {
    initAiWebSocket,
    notifyUser
};
