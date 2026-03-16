'use strict';

const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const config = require('../config/env');
const actionRouter = require('./actionRouter');
const AppError = require('../utils/AppError');

const getGenAI = () => {
    if (!config.gemini.apiKey) return null;
    // Always create fresh to ensure latest API key from env is used
    return new GoogleGenerativeAI(config.gemini.apiKey);
};

const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

const webSearchService = require('./webSearchService');
const vectorDbService = require('./vectorDbService');
const prisma = require('../config/database');

// Define Google Functions
const googleFunctions = [
    {
        name: 'create_calendar_event',
        description: 'Creates a new event in the user\'s Google Calendar. Requires a title, start time, and end time in ISO 8601 format.',
        parameters: {
            type: 'OBJECT',
            properties: {
                summary: { type: 'STRING', description: 'Title of the event' },
                description: { type: 'STRING', description: 'Detailed description' },
                start: { type: 'STRING', description: 'Start time (ISO 8601)' },
                end: { type: 'STRING', description: 'End time (ISO 8601)' }
            },
            required: ['summary', 'start', 'end']
        }
    },
    {
        name: 'list_calendar_events',
        description: 'Retrieves a list of upcoming events from the user\'s Google Calendar.',
        parameters: {
            type: 'OBJECT',
            properties: {
                maxResults: { type: 'INTEGER', description: 'Default is 5.' }
            }
        }
    },
    {
        name: 'send_email',
        description: 'Sends a new email using the user\'s Gmail account.',
        parameters: {
            type: 'OBJECT',
            properties: {
                to: { type: 'STRING', description: 'Recipient email address' },
                subject: { type: 'STRING', description: 'Subject of the email' },
                body: { type: 'STRING', description: 'HTML or plain text body of the email' }
            },
            required: ['to', 'subject', 'body']
        }
    },
    {
        name: 'get_inbox',
        description: 'Retrieves a list of recent emails from the user\'s Gmail inbox.',
        parameters: {
            type: 'OBJECT',
            properties: {
                maxResults: { type: 'INTEGER', description: 'Number of emails to fetch (default 5)' }
            }
        }
    }
];

// Define Native Phone Functions
const nativeFunctions = [
    {
        name: 'set_alarm',
        description: 'Sets a physical alarm on the user\'s phone. Use this for wake-up calls, reminders, or timers.',
        parameters: {
            type: 'OBJECT',
            properties: {
                time: { type: 'STRING', description: 'The time for the alarm in ISO 8601 format. IMPORTANT: The system time provided is the user\'s LOCAL time. Calculate the ISO string relative to this local time.' },
                label: { type: 'STRING', description: 'A short label for the alarm' }
            },
            required: ['time']
        }
    },
    {
        name: 'make_call',
        description: 'Initiates a phone call to a contact by name.',
        parameters: {
            type: 'OBJECT',
            properties: {
                contactName: { type: 'STRING', description: 'The name of the person to call' }
            },
            required: ['contactName']
        }
    },
    {
        name: 'open_app',
        description: 'Opens a specific app on the user\'s phone (e.g., Instagram, Spotify, YouTube).',
        parameters: {
            type: 'OBJECT',
            properties: {
                appName: { type: 'STRING', description: 'The name of the app to open' }
            },
            required: ['appName']
        }
    },
    {
        name: 'open_url',
        description: 'Opens a specific website or URL in the phone\'s browser.',
        parameters: {
            type: 'OBJECT',
            properties: {
                url: { type: 'STRING', description: 'The full URL to open' }
            },
            required: ['url']
        }
    },
    {
        name: 'play_music',
        description: 'Searches for and plays a specific song or artist on YouTube.',
        parameters: {
            type: 'OBJECT',
            properties: {
                songName: { type: 'STRING', description: 'The name of the song or artist' }
            },
            required: ['songName']
        }
    }
];

// Define Core Sora Functions
const coreFunctions = [
    {
        name: 'perform_web_search',
        description: 'Searches the live internet for real-time information (news, weather, stock prices, facts). Use this when your internal knowledge is stale or for current events.',
        parameters: {
            type: 'OBJECT',
            properties: {
                query: { type: 'STRING', description: 'The search query string' }
            },
            required: ['query']
        }
    },
    {
        name: 'query_knowledge_base',
        description: 'Searches through the user\'s uploaded documents, notes, and past conversations (RAG). Use this to answer personal questions about the user\'s data.',
        parameters: {
            type: 'OBJECT',
            properties: {
                query: { type: 'STRING', description: 'What personal information to look for' }
            },
            required: ['query']
        }
    },
    {
        name: 'send_whatsapp_message',
        description: 'Sends a WhatsApp message to a contact by name or number.',
        parameters: {
            type: 'OBJECT',
            properties: {
                to: { type: 'STRING', description: 'The name or phone number of the recipient' },
                message: { type: 'STRING', description: 'The message content to send' }
            },
            required: ['to', 'message']
        }
    },
    {
        name: 'list_whatsapp_chats',
        description: 'Retrieves a list of recent WhatsApp chats and groups.',
        parameters: {
            type: 'OBJECT',
            properties: {
                limit: { type: 'INTEGER', description: 'Number of chats to return (default 10)' }
            }
        }
    },
    {
        name: 'list_whatsapp_contacts',
        description: 'Retrieves a list of all saved WhatsApp contacts and their names.',
        parameters: {
            type: 'OBJECT',
            properties: {
                limit: { type: 'INTEGER', description: 'Number of contacts to return (default 20)' }
            }
        }
    },
    {
        name: 'schedule_whatsapp_message',
        description: 'Schedules a WhatsApp message to be sent at a specific time in the future. Use this when the user says "after X minutes", "at 5pm", or "tomorrow".',
        parameters: {
            type: 'OBJECT',
            properties: {
                to: { type: 'STRING', description: 'The name or phone number of the recipient' },
                message: { type: 'STRING', description: 'The message content to send' },
                time: { type: 'STRING', description: 'The scheduled time in ISO 8601 format. IMPORTANT: Calculate this based on the LOCAL system time provided in the context. Do NOT use UTC unless specified.' }
            },
            required: ['to', 'message', 'time']
        }
    }
];

const SYSTEM_PROMPT = `You are Sora, a concise and highly capable AI assistant.
You have tools for Phone Controls (Alarm, Calls, Apps), Google Calendar (if linked), Web Search, WhatsApp Messaging, and searching the User's Personal Knowledge Base.

ALARM vs CALENDAR:
- If a user says "Set an alarm", "Wake me up", or "Start a timer", ALWAYS use the 'set_alarm' tool for the phone.
- Use Google Calendar tools ONLY if the user specifically mentions "Calendar", "Event", "Meeting", or "Schedule".

WHATSAPP SYNC: If the user asks to send a message to someone and you cannot find them, they might be syncing. Advise the user: "I couldn't find [Name] yet. If you just cleared my cache, please wait a minute for my contacts to re-sync, or provide their phone number."
CONSTRAINTS:
1. Respond in 1-2 natural sentences max.
2. ALWAYS include a hidden sentiment tag at the VERY END of your response based on your mood.
   Sentiments: [SENTIMENT:HAPPY], [SENTIMENT:THINKING], [SENTIMENT:ALERT], [SENTIMENT:SAD], [SENTIMENT:QUESTION].
   Example: "I've scheduled your meeting. [SENTIMENT:HAPPY]"`;

// Model waterfall — using the latest models provided by the user
const GEMINI_MODELS = [
    'gemini-1.5-flash',             // High speed, high quota, vision support
    'gemini-2.0-flash',             // Latest multimodal
    'gemini-1.5-pro',               // Deep reasoning
    'gemini-2.0-flash-lite-preview', // Speed optimized
];

const isRetryableError = (error) => {
    const status = error.status || error.code;
    const msg = error.message?.toLowerCase() || '';
    return (
        status === 429 || status === 404 || status === 403 || status === 500 ||
        msg.includes('quota') || msg.includes('not found') ||
        msg.includes('limit') || msg.includes('fetching from') ||
        msg.includes('model is not')
    );
};

/**
 * Try to run a Gemini conversation with the given model name.
 * Returns the result, or throws if the model itself has a fatal error.
 */
const runWithModel = async (ai, modelName, userId, userMessage, context, imageBase64, effectiveTools) => {
    const model = ai.getGenerativeModel({
        model: modelName,
        tools: [effectiveTools],
        safetySettings,
        systemInstruction: {
            role: 'system',
            parts: [{ text: `[SYSTEM CONTEXT: ${new Date().toString()}]\n${SYSTEM_PROMPT}` }]
        }
    });

    let history = context.map(c => ({
        role: c.role === 'assistant' ? 'model' : c.role,
        parts: [{ text: c.content }]
    }));
    const firstUserIndex = history.findIndex(h => h.role === 'user');
    if (firstUserIndex !== -1) {
        history = history.slice(firstUserIndex);
    } else if (history.length > 0) {
        history = [];
    }

    const chat = model.startChat({ history });

    const messageParts = [];
    if (imageBase64) {
        const cleanBase64 = imageBase64.includes('base64,')
            ? imageBase64.split('base64,')[1]
            : imageBase64;
        console.log(`[GeminiAgent] Vision enabled. Clean Base64 length: ${cleanBase64.length}`);
        messageParts.push({ inlineData: { data: cleanBase64, mimeType: 'image/jpeg' } });
    }
    messageParts.push({ text: userMessage });

    let result = await chat.sendMessage(messageParts);
    let response = result.response;
    let functionCalls = response.functionCalls();

    while (functionCalls && functionCalls.length > 0) {
        const toolResponses = [];
        for (const call of functionCalls) {
            let toolResult;
            let actionName = call.name.toUpperCase();
            try {
                if (call.name === 'create_calendar_event' || call.name === 'list_calendar_events') {
                    const args = call.name === 'list_calendar_events' ? { maxResults: call.args.maxResults || 5 } : call.args;
                    toolResult = await actionRouter.routeAction(userId, actionName, args);
                } else if (call.name === 'perform_web_search') {
                    toolResult = await webSearchService.performWebSearch(call.args.query);
                } else if (call.name === 'query_knowledge_base') {
                    const queryEmbedding = await require('./embeddingService').generateEmbedding(call.args.query);
                    const matches = queryEmbedding ? await vectorDbService.queryVectors(queryEmbedding, userId) : [];
                    toolResult = matches.length > 0 ? matches.map(m => m.text).join('\n---\n') : 'No relevant personal info found.';
                } else if (call.name === 'send_whatsapp_message') {
                    toolResult = await actionRouter.routeAction(userId, 'SEND_WHATSAPP', call.args);
                } else if (call.name === 'list_whatsapp_chats') {
                    toolResult = await actionRouter.routeAction(userId, 'GET_WHATSAPP_MESSAGES', call.args);
                } else if (call.name === 'list_whatsapp_contacts') {
                    toolResult = await actionRouter.routeAction(userId, 'GET_WHATSAPP_CONTACTS', call.args);
                } else if (call.name === 'clear_whatsapp_cache') {
                    toolResult = await actionRouter.routeAction(userId, 'CLEAR_WHATSAPP_CACHE', call.args);
                } else if (call.name === 'send_email') {
                    toolResult = await actionRouter.routeAction(userId, 'SEND_EMAIL', call.args);
                } else if (call.name === 'get_inbox') {
                    toolResult = await actionRouter.routeAction(userId, 'GET_INBOX', call.args);
                } else if (call.name === 'set_alarm') {
                    toolResult = await actionRouter.routeAction(userId, 'SET_ALARM', call.args);
                } else if (call.name === 'make_call') {
                    toolResult = await actionRouter.routeAction(userId, 'MAKE_CALL', call.args);
                } else if (call.name === 'open_app') {
                    toolResult = await actionRouter.routeAction(userId, 'OPEN_APP', call.args);
                } else if (call.name === 'open_url') {
                    toolResult = await actionRouter.routeAction(userId, 'OPEN_URL', call.args);
                } else if (call.name === 'play_music') {
                    toolResult = await actionRouter.routeAction(userId, 'PLAY_MUSIC', call.args);
                } else if (call.name === 'schedule_whatsapp_message') {
                    toolResult = await actionRouter.routeAction(userId, 'SCHEDULE_WHATSAPP', call.args);
                } else {
                    toolResult = { error: 'Unknown tool' };
                }
            } catch (err) {
                console.error(`Tool error (${call.name}):`, err.message);
                toolResult = { error: err.message };
            }
            toolResponses.push({
                functionResponse: { name: call.name, response: { result: toolResult } }
            });
        }
        result = await chat.sendMessage(toolResponses);
        response = result.response;
        functionCalls = response.functionCalls();
    }

    return { type: 'CHAT', message: response.text() };
};

/**
 * Process a user message using Gemini with Function Calling and return a stream.
 */
const streamMessageWithTools = async (userId, userMessage, context = [], imageBase64 = null) => {
    console.log(`[GeminiAgent] Starting stream for user ${userId}. Vision: ${!!imageBase64}`);

    const preferredModel = config.gemini.model;
    const modelQueue = [preferredModel, ...GEMINI_MODELS.filter(m => m !== preferredModel)];

    // Build toolset
    const tokenRecord = await prisma.googleToken.findUnique({ where: { userId } });
    const isGoogleLinked = !!tokenRecord;
    const toolDeclarations = [...coreFunctions, ...nativeFunctions];
    if (isGoogleLinked) toolDeclarations.push(...googleFunctions);
    const effectiveTools = { functionDeclarations: toolDeclarations };

    return (async function* () {
        for (const modelName of modelQueue) {
            if (!modelName) continue;
            try {
                console.log(`[GeminiAgent] Trying model: ${modelName}`);
                const ai = getGenAI();
                if (!ai) throw new Error('API Key missing');

                const model = ai.getGenerativeModel({
                    model: modelName,
                    tools: [effectiveTools],
                    safetySettings,
                    systemInstruction: {
                        role: 'system',
                        parts: [{ text: `[SYSTEM CONTEXT: ${new Date().toString()}]\n${SYSTEM_PROMPT}` }]
                    }
                });

                let history = context.map(c => ({
                    role: c.role === 'assistant' ? 'model' : c.role,
                    parts: [{ text: c.content }]
                }));
                const firstUserIndex = history.findIndex(h => h.role === 'user');
                history = firstUserIndex !== -1 ? history.slice(firstUserIndex) : [];

                const chat = model.startChat({ history });
                const messageParts = [];
                if (imageBase64) {
                    const cleanBase64 = imageBase64.includes('base64,') ? imageBase64.split('base64,')[1] : imageBase64;
                    messageParts.push({ inlineData: { data: cleanBase64, mimeType: 'image/jpeg' } });
                }
                messageParts.push({ text: userMessage });

                const result = await chat.sendMessageStream(messageParts);
                
                // CRITICAL: We await the response here to catch quota errors BEFORE yielding anything.
                // If this fails, we catch it and continue to the next model.
                let response = await result.response;
                let functionCalls = response.functionCalls();

                if (!functionCalls || functionCalls.length === 0) {
                    for await (const chunk of result.stream) {
                        const token = chunk.text();
                        if (token) yield { type: 'TOKEN', text: token };
                    }
                    return; // Success
                }

                // Tool call loop
                while (functionCalls && functionCalls.length > 0) {
                    const toolResponses = [];
                    for (const call of functionCalls) {
                        let toolResult;
                        yield { type: 'THOUGHT', text: `Executing ${call.name}...` };
                        try {
                            if (call.name === 'create_calendar_event' || call.name === 'list_calendar_events') {
                                toolResult = await actionRouter.routeAction(userId, call.name.toUpperCase(), call.args);
                            } else if (call.name === 'perform_web_search') {
                                toolResult = await webSearchService.performWebSearch(call.args.query);
                            } else if (call.name === 'query_knowledge_base') {
                                const emb = await require('./embeddingService').generateEmbedding(call.args.query);
                                const matches = emb ? await vectorDbService.queryVectors(emb, userId) : [];
                                toolResult = matches.length > 0 ? matches.map(m => m.text).join('\n---\n') : 'No info found.';
                            } else if (call.name === 'send_whatsapp_message') {
                                toolResult = await actionRouter.routeAction(userId, 'SEND_WHATSAPP', call.args);
                            } else if (call.name === 'list_whatsapp_chats') {
                                toolResult = await actionRouter.routeAction(userId, 'GET_WHATSAPP_MESSAGES', call.args);
                            } else if (call.name === 'list_whatsapp_contacts') {
                                toolResult = await actionRouter.routeAction(userId, 'GET_WHATSAPP_CONTACTS', call.args);
                            } else if (call.name === 'set_alarm') {
                                toolResult = await actionRouter.routeAction(userId, 'SET_ALARM', call.args);
                            } else if (call.name === 'make_call') {
                                toolResult = await actionRouter.routeAction(userId, 'MAKE_CALL', call.args);
                            } else if (call.name === 'open_app') {
                                toolResult = await actionRouter.routeAction(userId, 'OPEN_APP', call.args);
                            } else if (call.name === 'open_url') {
                                toolResult = await actionRouter.routeAction(userId, 'OPEN_URL', call.args);
                            } else if (call.name === 'play_music') {
                                toolResult = await actionRouter.routeAction(userId, 'PLAY_MUSIC', call.args);
                            } else if (call.name === 'schedule_whatsapp_message') {
                                toolResult = await actionRouter.routeAction(userId, 'SCHEDULE_WHATSAPP', call.args);
                            } else {
                                toolResult = { error: 'Unknown tool' };
                            }
                        } catch (err) {
                            toolResult = { error: err.message };
                        }
                        toolResponses.push({ functionResponse: { name: call.name, response: { result: toolResult } } });
                    }
                    
                    const nextResult = await chat.sendMessageStream(toolResponses);
                    response = await nextResult.response;
                    functionCalls = response.functionCalls();
                    
                    if (!functionCalls || functionCalls.length === 0) {
                        for await (const chunk of nextResult.stream) {
                            const token = chunk.text();
                            if (token) yield { type: 'TOKEN', text: token };
                        }
                    }
                }
                return; // Success
            } catch (error) {
                console.error(`[GeminiAgent] Error with ${modelName}:`, error.message);
                if (isRetryableError(error)) {
                    console.warn(`[GeminiAgent] Retrying with next model...`);
                    continue;
                }
                // If not retryable, yield the error and stop
                yield { type: 'TOKEN', text: `I encountered an error: ${error.message}` };
                return;
            }
        }

        // Final Fallback to Groq
        console.warn(`[GeminiAgent] All models failed. Falling back to Groq.`);
        try {
            const fallbackResult = await require('./agentService').processMessage(userId, userMessage, context, imageBase64);
            yield { type: 'TOKEN', text: fallbackResult.message || 'I am having trouble replying right now.' };
        } catch (fErr) {
            yield { type: 'TOKEN', text: 'Sorry, I am currently unable to process your request.' };
        }
    })();
};

/**
 * Non-streaming version for REST API calls
 */
const processMessageWithTools = async (userId, userMessage, context = [], imageBase64 = null) => {
    const stream = await streamMessageWithTools(userId, userMessage, context, imageBase64);
    let fullText = '';
    
    for await (const chunk of stream) {
        if (chunk.type === 'TOKEN') {
            fullText += chunk.text;
        }
    }
    
    return {
        type: 'CHAT',
        message: fullText
    };
};

module.exports = { processMessageWithTools, streamMessageWithTools };

