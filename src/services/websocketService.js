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

const handleAiChat = async (ws, payload) => {
    const { message, context = [] } = payload;
    try {
        const stream = await aiService.getStreamingCompletion([
            ...context,
            { role: 'user', content: message }
        ]);

        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
                ws.send(JSON.stringify({ type: 'AI_TOKEN', content }));
            }
        }
        ws.send(JSON.stringify({ type: 'AI_COMPLETE' }));
    } catch (err) {
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
