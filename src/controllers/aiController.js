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
    const { message, conversationId, image } = req.body; // conversationId for isolation
    console.log(`[AI Controller] REQ BODY KEYS:`, Object.keys(req.body));
    console.log(`[AI Controller] Message: "${message}", Image size: ${image ? image.length : 0}, ConversationId: ${conversationId}`);

    // Build filter: Isolated by conversationId if provided, else general user history
    const historyFilter = { userId: req.user.id };
    if (conversationId) {
        historyFilter.conversationId = conversationId;
    }

    // 1. Fetch context and Create user message in PARALLEL to save time
    let recentConversations = [];
    try {
        const [convs, _userMsg] = await Promise.all([
            prisma.conversation.findMany({
                where: historyFilter,
                orderBy: { timestamp: 'desc' },
                take: 10
            }),
            prisma.conversation.create({
                data: {
                    userId: req.user.id,
                    conversationId: conversationId || null,
                    role: 'USER',
                    message: image ? `[Sent an Image] ${message}` : message
                }
            })
        ]);
        recentConversations = convs;
    } catch (dbError) {
        console.error('Database error during parallel context fetch:', dbError.message);
        // Fallback: Continue with empty history if fetch fails, but don't crash if possible
    }

    const context = recentConversations.reverse().map(c => ({
        role: c.role.toLowerCase(),
        content: c.message
    }));

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
                conversationId: conversationId || null,
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
