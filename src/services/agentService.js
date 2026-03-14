'use strict';

const aiService = require('./aiService');
const actionRouter = require('./actionRouter');
const embeddingService = require('./embeddingService');
const vectorDbService = require('./vectorDbService');
const whatsappService = require('./whatsappService');
const { queues } = require('../queues');
const AppError = require('../utils/AppError');
const prisma = require('../config/database');
const logger = require('../config/logger');
const { v4: uuidv4 } = require('uuid');

const SYSTEM_PROMPT = `You are Sora, a concise AI assistant. 
REASONING: Briefly analyze intent in a 1-sentence "thought" field.
FORMAT: Strict JSON only:
{
  "thought": "Direct analysis of user intent",
  "type": "ACTION" | "CHAT",
  "action": "ACTION_KEY",
  "payload": { ... },
  "message": "Response message here [SENTIMENT:TAG]"
}
CONSTRAINTS:
1. Message must be 1-2 sentences.
2. ALWAYS include a sentiment tag like [SENTIMENT:HAPPY] at the end of the "message" field.
3. TOOL USAGE: If the user asks you to DO something (send message, set alarm, search web, etc.), you MUST set "type": "ACTION" and use the correct "action" key. DO NOT just reply with text if a tool is available.

ACTIONS:
- SEND_WHATSAPP: {to: "name", message: "text"} -> Use for IMMEDIATE messages.
- SCHEDULE_WHATSAPP: {to: "name", message: "text", time: "ISO"} -> MUST use for any future messages ("after 5 min", "at 10pm", "tomorrow"). Use ISO 8601.
- GET_WHATSAPP_MESSAGES: {limit: 10}
- GET_WHATSAPP_CONTACTS: {limit: 20}
- CLEAR_WHATSAPP_CACHE: {}
- SET_ALARM: {time: "ISO", label: "text"} -> MUST use ISO 8601. IMPORTANT: The system time provided is the user's LOCAL time. Calculate the ISO string relative to this local time.
- WEB_SEARCH: {query: "string"} -> Use this for news, weather, stock prices, or any real-time info.
- MAKE_CALL: {contactName: "name"}
- OPEN_APP: {appName: "name"}
- Google: CREATE_CALENDAR_EVENT, LIST_CALENDAR_EVENTS, SEND_EMAIL, GET_INBOX.
- UPLOAD_DRIVE_FILE: {name: "string", mimeType: "string", content: "string"}
- LIST_DRIVE_FILES: {pageSize: 10}

EXAMPLE (WEB SEARCH):
User: "What's the weather in Mumbai?"
{
  "thought": "User wants real-time weather info. I'll use web search.",
  "type": "ACTION",
  "action": "WEB_SEARCH",
  "payload": {"query": "weather in Mumbai"},
  "message": "Checking the weather in Mumbai for you... [SENTIMENT:THINKING]"
}

EXAMPLE (SENDING WHATSAPP):
User: "Tell Anushka I'm on my way"
{
  "thought": "User wants to send a WhatsApp message to Anushka.",
  "type": "ACTION",
  "action": "SEND_WHATSAPP",
  "payload": {"to": "Anushka", "message": "I'm on my way"},
  "message": "Sending that message to Anushka now. [SENTIMENT:HAPPY]"
}

Proactively use context. Keep reasoning ultra-brief.`;

const processMessage = async (userId, userMessage, context = [], image = null) => {
    // 1. Prep RAG and Context in parallel
    const getRagContext = async () => {
        try {
            const queryEmbedding = await embeddingService.generateEmbedding(userMessage);
            const similarMemories = await vectorDbService.queryVectors(queryEmbedding, userId);
            if (similarMemories.length > 0) {
                return '\nRELEVANT PAST CONTEXT:\n' + similarMemories.map(m => `- ${m.role}: ${m.text}`).join('\n');
            }
        } catch (err) {
            console.warn('RAG search failed.', err.message);
        }
        return '';
    };

    const getWhatsappContext = () => {
        const lastMsg = whatsappService.getLastReceivedMessage();
        if (lastMsg) {
            const minAgo = Math.round((Date.now() - lastMsg.timestamp) / 60000);
            if (minAgo < 60) {
                return `\n[RECENT WHATSAPP]: Received a message from ${lastMsg.from} (${minAgo} min ago): "${lastMsg.text}". If the user asks you to "reply", "tell him", or responds conversationally, USE this contact name ("${lastMsg.from}") for the SEND_WHATSAPP action.`;
            }
        }
        return '';
    };

    const [ragContext, whatsappContext] = await Promise.all([
        getRagContext(),
        Promise.resolve(getWhatsappContext())
    ]);

    const visionContext = image ? "\n[VISION NOTICE]: The user sent an image with this message, but you (the fallback engine) cannot see it. Please apologize and explain that you are currently in fallback mode and cannot analyze images right now." : "";

    const messages = [
        { role: 'system', content: `[SYSTEM CONTEXT: ${new Date().toString()}]\n` + SYSTEM_PROMPT + ragContext + whatsappContext + visionContext },
        ...context,
        { role: 'user', content: userMessage }
    ];

    const aiResponseString = await aiService.getChatCompletion(messages);
    let aiResponse;

    try {
        aiResponse = JSON.parse(aiResponseString);
    } catch (error) {
        console.error('Failed to parse AI response:', aiResponseString);
        throw new AppError('AI generated an invalid response format.', 500, 'AI_PARSE_ERROR');
    }

    // 2. Offload memory storage to background worker (Fire and forget)
    if (userMessage.length > 10) {
        queues.embedding.add(`embed-${uuidv4()}`, { userId, text: userMessage, source: 'chat' }).catch(() => {});
    }

    if (aiResponse.type === 'ACTION') {
        let result;
        try {
            // Execute the action via the router
            result = await actionRouter.routeAction(userId, aiResponse.action, aiResponse.payload);
        } catch (actionError) {
            console.error(`Action ${aiResponse.action} failed:`, actionError.message);
            return {
                type: 'CHAT',
                message: actionError.message || `Sorry, I couldn't complete the action: ${aiResponse.action}.`
            };
        }

        // For client-side actions (MAKE_CALL, OPEN_APP), return immediately
        if (result?.clientAction) {
            return {
                type: 'ACTION_RESULT',
                action: aiResponse.action,
                result,
                message: result.message
            };
        }

        // --- SECOND PASS: Summarize tool results (WebSearch, Whatsapp Logs, etc.) ---
        try {
            logger.info(`Finalizing ${aiResponse.action} with a second AI pass for summary...`);
            const summaryMessages = [
                ...messages,
                { role: 'assistant', content: aiResponseString },
                { role: 'user', content: `TOOL_RESULT: ${JSON.stringify(result)}\nSummarize this for me naturally in 1-2 sentences.` }
            ];

            const summaryString = await aiService.getChatCompletion(summaryMessages);
            let summaryResponse;
            try {
                summaryResponse = JSON.parse(summaryString);
                return {
                    ...summaryResponse,
                    action: aiResponse.action,
                    result
                };
            } catch (e) {
                // If AI doesn't return JSON, treat as raw message
                return {
                    type: 'CHAT',
                    message: summaryString,
                    action: aiResponse.action,
                    result
                };
            }
        } catch (summarizeErr) {
            logger.warn('Tool summarization failed, returning raw result.', summarizeErr.message);
            return {
                type: 'ACTION_RESULT',
                action: aiResponse.action,
                result,
                message: aiResponse.message || `Action ${aiResponse.action} completed successfully.`
            };
        }
    }

    return aiResponse;
};

module.exports = {
    processMessage,
};
