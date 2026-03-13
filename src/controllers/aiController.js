'use strict';

const agentService = require('../services/agentService');
const geminiAgentService = require('../services/geminiAgentService');
const { sendSuccess } = require('../utils/response');
const { asyncHandler } = require('../utils/asyncHandler');
const prisma = require('../config/database');

/**
 * POST /api/ai/message
 */
const sendMessage = asyncHandler(async (req, res) => {
    const { message, conversationId, image } = req.body; // Added image for Vision
    console.log(`[AI Controller] REQ BODY KEYS:`, Object.keys(req.body));
    console.log(`[AI Controller] Message: "${message}", Image size: ${image ? image.length : 0}`);

    // Retrieve last few messages for context (simple approach for now)
    const recentConversations = await prisma.conversation.findMany({
        where: { userId: req.user.id },
        orderBy: { timestamp: 'desc' },
        take: 10 // Increased context for better tool awareness
    });

    const context = recentConversations.reverse().map(c => ({
        role: c.role.toLowerCase(),
        content: c.message
    }));

    // Save user message
    await prisma.conversation.create({
        data: {
            userId: req.user.id,
            role: 'USER',
            message: image ? `[Sent an Image] ${message}` : message
        }
    });

    try {
        // Use the new Gemini Agent Service that supports Tools (Calendar, etc.)
        const result = await geminiAgentService.processMessageWithTools(req.user.id, message, context, image);

        // Save AI response
        let displayMessage = result.message || (result.type === 'CHAT' ? '' : `ACTION: ${result.action || 'SORA_ACTION'}`);
        if (!displayMessage && result.type === 'CHAT') displayMessage = 'Sora: [Silent Thinking]';

        if (typeof displayMessage === 'object') {
            displayMessage = JSON.stringify(displayMessage);
        }

        await prisma.conversation.create({
            data: {
                userId: req.user.id,
                role: 'ASSISTANT',
                message: displayMessage
            }
        });

        sendSuccess(res, { data: result });
    } catch (error) {
        console.error('------- AI CONTROLLER FATAL ERROR --------');
        console.error('Stack:', error.stack);
        console.error('Message:', error.message);
        throw error; // Let asyncHandler handle the final response
    }
});

module.exports = {
    sendMessage,
};
