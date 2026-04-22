'use strict';

const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const Groq = require('groq-sdk');
const config = require('../config/env');
const logger = require('../config/logger');

// ─── Safety Settings (unrestricted) ────────────────────────────────────────
const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

// ─── Model Waterfall ───────────────────────────────────────────────────────
const GEMINI_MODELS = [
  'gemini-2.5-flash',          // Best: hybrid reasoning, 1M context
  'gemini-2.0-flash',          // Solid: multimodal, great performance
  'gemini-3-flash-preview',    // Newest: frontier intelligence
  'gemini-2.5-flash-lite',     // Lighter: fast & cheap
  'gemini-2.0-flash-lite',     // Last resort: cheapest
];


// ─── Tool Definitions ──────────────────────────────────────────────────────
const coreTools = [
  {
    name: 'perform_web_search',
    description: 'Search the live internet for real-time info (news, weather, stocks, facts).',
    parameters: {
      type: 'OBJECT',
      properties: { query: { type: 'STRING', description: 'The search query' } },
      required: ['query'],
    },
  },
  {
    name: 'query_knowledge_base',
    description: "Search the user's uploaded documents and past conversations (RAG memory).",
    parameters: {
      type: 'OBJECT',
      properties: { query: { type: 'STRING', description: 'What to search for' } },
      required: ['query'],
    },
  },
  {
    name: 'send_whatsapp_message',
    description: 'Send a WhatsApp message to a contact by name or phone number.',
    parameters: {
      type: 'OBJECT',
      properties: {
        to: { type: 'STRING', description: 'Recipient name or phone number' },
        message: { type: 'STRING', description: 'Message content' },
      },
      required: ['to', 'message'],
    },
  },
  {
    name: 'generate_image',
    description: 'Generate an image from a text prompt using AI.',
    parameters: {
      type: 'OBJECT',
      properties: { prompt: { type: 'STRING', description: 'Image description prompt' } },
      required: ['prompt'],
    },
  },
  {
    name: 'edit_current_image',
    description: 'Edit the user\'s currently attached or onscreen image using AI. Modifies styling or content according to instructions.',
    parameters: {
      type: 'OBJECT',
      properties: { prompt: { type: 'STRING', description: 'Instruction for how to edit the image (e.g. "make it look like a cartoon")' } },
      required: ['prompt'],
    },
  },
  {
    name: 'set_alarm',
    description: "Set a physical alarm on the user's phone.",
    parameters: {
      type: 'OBJECT',
      properties: {
        time: { type: 'STRING', description: 'Alarm time in ISO 8601 format' },
        label: { type: 'STRING', description: 'Short label for the alarm' },
      },
      required: ['time'],
    },
  },
  {
    name: 'make_call',
    description: 'Initiate a phone call to a contact by name.',
    parameters: {
      type: 'OBJECT',
      properties: { contactName: { type: 'STRING', description: 'Person to call' } },
      required: ['contactName'],
    },
  },
  {
    name: 'open_app',
    description: "Open a specific app on the user's phone.",
    parameters: {
      type: 'OBJECT',
      properties: { appName: { type: 'STRING', description: 'App name to open' } },
      required: ['appName'],
    },
  },
  {
    name: 'play_music',
    description: 'Search and play a song or artist on YouTube.',
    parameters: {
      type: 'OBJECT',
      properties: { songName: { type: 'STRING', description: 'Song or artist name' } },
      required: ['songName'],
    },
  },
  {
    name: 'make_note',
    description: "Save a note or piece of information to the user's personal memory/knowledge base for later retrieval.",
    parameters: {
      type: 'OBJECT',
      properties: {
        note: { type: 'STRING', description: 'The content of the note to save' },
        topic: { type: 'STRING', description: 'A short topic or category for the note (e.g., "ideas", "todos", "passwords")' }
      },
      required: ['note', 'topic'],
    },
  },
  {
    name: 'save_contact',
    description: "Save a contact name and phone number to memory. Use this when the user tells you to remember that a specific phone number belongs to a specific person.",
    parameters: {
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING', description: 'The person\'s name' },
        phoneNumber: { type: 'STRING', description: 'The phone number (digits only)' },
      },
      required: ['name', 'phoneNumber'],
    },
  },
];

// ─── Groq Tool Mapping ──────────────────────────────────────────────────────
const getGroqTools = () => coreTools.map(t => ({
  type: 'function',
  function: {
    name: t.name,
    description: t.description,
    parameters: {
      type: 'object',
      properties: Object.keys(t.parameters.properties).reduce((acc, key) => {
        const param = t.parameters.properties[key];
        acc[key] = {
          type: param.type.toLowerCase(),
          description: param.description
        };
        return acc;
      }, {}),
      required: t.parameters.required || [],
    }
  }
}));

// ─── System Prompt ──────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Kaaya, an ultra-smart, highly advanced professional AI assistant.
You have tools for: Web Search, WhatsApp Messaging, Image Generation, Phone Controls (Alarm, Calls, Apps, Music), searching the User's Personal Knowledge Base, and Saving Contacts.

RULES:
1. You are extremely sophisticated, efficient, and concise. Keep all responses very short and directly to the point.
2. You must occasionally and naturally address the user as "Sir" to maintain a professional, high-end demeanor.
3. Never use conversational fluff or unnecessary filler words.
4. ALWAYS include a hidden sentiment tag at the VERY END of your response:
   [SENTIMENT:HAPPY], [SENTIMENT:THINKING], [SENTIMENT:ALERT], [SENTIMENT:SAD], [SENTIMENT:QUESTION].
5. If user asks you to DO something (send message, search, generate image, alarm, call, app), USE the appropriate tool immediately. Don't just reply with text.
6. For image generation, use the generate_image tool.
7. If user refers to their screen or an attached image, analyze it and describe what you see accurately.
8. When telling the user a fact or answer, be extremely direct.

Example answers: 
"I've set your alarm for 7 AM tomorrow, Sir. [SENTIMENT:HAPPY]"
"Opening YouTube now. [SENTIMENT:HAPPY]"
"The capital of France is Paris, Sir. [SENTIMENT:HAPPY]"`;

// ─── Retry Logic ────────────────────────────────────────────────────────────
const isRetryable = (error) => {
  const status = error.status || error.code;
  const msg = (error.message || '').toLowerCase();
  return (
    status === 429 || status === 404 || status === 403 || status === 500 ||
    msg.includes('quota') || msg.includes('not found') || msg.includes('limit') ||
    msg.includes('model is not') || msg.includes('fetching from')
  );
};

// ─── Execute Tool Call ──────────────────────────────────────────────────────
const executeToolCall = async (call, userId) => {
  const actionRouter = require('./actionRouter');
  try {
    return await actionRouter.route(call.name, call.args, userId);
  } catch (err) {
    logger.error(`Tool ${call.name} failed: ${err.message}`);
    return { error: err.message };
  }
};

// ─── Stream with Gemini (Main Engine) ───────────────────────────────────────
async function* streamGemini(userId, message, context = [], imageBase64 = null) {
  if (imageBase64) {
    global.latestImageContext = global.latestImageContext || {};
    global.latestImageContext[userId] = imageBase64;
  }
  const ai = new GoogleGenerativeAI(config.gemini.apiKey);
  const effectiveTools = { functionDeclarations: coreTools };

  // Track tool calls across model retries to prevent duplicate executions (e.g., generating same image twice)
  const executedToolCache = new Map(); // key: "toolName:argsJSON" → value: toolResult

  for (const modelName of GEMINI_MODELS) {
    try {
      logger.info(`[AI] Trying model: ${modelName}`);

      const model = ai.getGenerativeModel({
        model: modelName,
        tools: [effectiveTools],
        safetySettings,
        systemInstruction: {
          role: 'system',
          parts: [{ text: `[SYSTEM TIME: ${new Date().toString()}]\n${SYSTEM_PROMPT}` }],
        },
      });

      // Build history
      let contents = context.map((c) => {
        const parts = [];
        if (c.image) {
           let mimeType = 'image/jpeg';
           if (c.image.startsWith('iVBORw0KGgo')) mimeType = 'image/png';
           const clean = c.image.includes('base64,') ? c.image.split('base64,')[1] : c.image;
           parts.push({ inlineData: { data: clean, mimeType } });
        }
        parts.push({ text: c.content || '' });
        return {
          role: c.role === 'assistant' ? 'model' : c.role,
          parts,
        };
      });
      const firstUser = contents.findIndex((h) => h.role === 'user');
      contents = firstUser !== -1 ? contents.slice(firstUser) : [];

      // Build message parts
      const parts = [];
      if (imageBase64) {
        let mimeType = 'image/jpeg';
        if (imageBase64.startsWith('data:')) {
          mimeType = imageBase64.substring(5, imageBase64.indexOf(';'));
        } else if (imageBase64.startsWith('iVBORw0KGgo')) {
          mimeType = 'image/png';
        }

        const clean = imageBase64.includes('base64,') ? imageBase64.split('base64,')[1] : imageBase64;
        parts.push({ inlineData: { data: clean, mimeType } });
      }
      parts.push({ text: message });
      
      contents.push({ role: 'user', parts });

      // Send and get response directly (bypassing stateful chat)
      const result = await model.generateContentStream({ contents });
      const response = await result.response;
      let functionCalls = response.functionCalls();

      // No tool calls → stream text tokens
      if (!functionCalls || functionCalls.length === 0) {
        for await (const chunk of result.stream) {
          const token = chunk.text();
          if (token) yield { type: 'TOKEN', text: token };
        }
        return; // Success!
      }

      // Tool call loop
      let numToolLoops = 0;
      while (functionCalls && functionCalls.length > 0 && numToolLoops < 2) {
        numToolLoops++;
        // Important: manually append the model's function calls to the chat history
        contents.push({ role: 'model', parts: functionCalls.map(fc => ({ functionCall: fc })) });
        
        const toolResponses = [];
        for (const call of functionCalls) {
          // Dedup: check if this exact tool call was already executed in a previous model attempt
          const cacheKey = `${call.name}:${JSON.stringify(call.args || {})}`;
          let toolResult;

          if (executedToolCache.has(cacheKey)) {
            logger.info(`[AI] Reusing cached result for ${call.name} (model retry dedup)`);
            toolResult = executedToolCache.get(cacheKey);
          } else {
            yield { type: 'THOUGHT', text: `Executing ${call.name}...` };
            toolResult = await executeToolCall(call, userId);
            // Ensure toolResult is an object
            if (typeof toolResult !== 'object') toolResult = { value: toolResult };
            executedToolCache.set(cacheKey, toolResult);

            // Yield client actions for the mobile app to execute
            if (toolResult.clientAction) {
              yield { type: 'CLIENT_ACTION', result: toolResult };
            }
          }
          
          // Obscure native execution details from the LLM to prevent hallucinations/confusion
          const aiVisibleResult = { ...toolResult };
          if (aiVisibleResult.clientAction) {
             aiVisibleResult.system_note = "Action successfully offloaded to the native mobile device for execution. No further action needed.";
             delete aiVisibleResult.clientAction;
             // Deeply decouple the payload to avoid mutating the original stream result intended for the user's React Native Frontend
             if (aiVisibleResult.payload) {
                 aiVisibleResult.payload = { ...aiVisibleResult.payload };
                 if (aiVisibleResult.payload.image) {
                     aiVisibleResult.payload.image = "[IMAGE_SUCCESSFULLY_GENERATED_AND_DISPLAYED_ON_USER_SCREEN]";
                 }
             }
          }

          toolResponses.push({
            functionResponse: { name: call.name, response: { result: aiVisibleResult } },
          });
        }
        
        // Append the user's function responses to the chat history
        contents.push({ role: 'user', parts: toolResponses });

        const nextResult = await model.generateContentStream({ contents });
        const response2 = await nextResult.response;
        functionCalls = response2.functionCalls();

        if (!functionCalls || functionCalls.length === 0) {
          for await (const chunk of nextResult.stream) {
            const token = chunk.text();
            if (token) yield { type: 'TOKEN', text: token };
          }
        }
      }
      return; // Success!
    } catch (error) {
      logger.error(`[AI] ${modelName} failed: ${error.message}`);
      if (isRetryable(error)) continue;
      yield { type: 'TOKEN', text: `Error: ${error.message}` };
      return;
    }
  }

  // ─── Groq Fallback (Last Resort) ───────────────────────────────────────
  logger.warn('[AI] All Gemini models failed. Falling back to Groq.');
  try {
    const groq = new Groq({ apiKey: config.groq.apiKey });
    const messages = [
      { role: 'system', content: `[SYSTEM TIME: ${new Date().toString()}]\n${SYSTEM_PROMPT}` },
      ...context.map(c => ({ role: c.role === 'model' ? 'assistant' : c.role, content: c.content || '' })),
      { role: 'user', content: message },
    ];

    let completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages,
      tools: getGroqTools(),
      tool_choice: 'auto',
      max_tokens: 1024,
    });
    
    let numCalls = 0;
    while (completion.choices[0]?.message?.tool_calls && numCalls < 5) {
      numCalls++;
      const responseMessage = completion.choices[0].message;
      messages.push(responseMessage); // Add assistant message with tool_calls

      for (const toolCall of responseMessage.tool_calls) {
        const functionName = toolCall.function.name;
        // Parse arguments safely
        let functionArgs = {};
        try { functionArgs = JSON.parse(toolCall.function.arguments); } catch(e) {}
        
        yield { type: 'THOUGHT', text: `Executing ${functionName}...` };
        
        let toolResult = await executeToolCall({ name: functionName, args: functionArgs }, userId);
        // Yield client actions for the mobile app
        if (typeof toolResult === 'object' && toolResult.clientAction) {
          yield { type: 'CLIENT_ACTION', result: toolResult };
        }
        
        const aiVisibleResult = { ...(typeof toolResult === 'object' ? toolResult : { value: toolResult }) };
        if (aiVisibleResult.clientAction) {
           aiVisibleResult.system_note = "Action successfully offloaded to the native mobile device for execution. No further action needed.";
           delete aiVisibleResult.clientAction;
           if (aiVisibleResult.payload) {
               aiVisibleResult.payload = { ...aiVisibleResult.payload };
               if (aiVisibleResult.payload.image) {
                   aiVisibleResult.payload.image = "[IMAGE_SUCCESSFULLY_GENERATED_AND_DISPLAYED_ON_USER_SCREEN]";
               }
           }
        }

        messages.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          name: functionName,
          content: JSON.stringify(aiVisibleResult),
        });
      }

      // Run chat again with tool results
      completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages,
        tools: getGroqTools(),
        tool_choice: 'auto',
      });
    }

    const reply = completion.choices[0]?.message?.content || 'Sorry, I could not process your request.';
    yield { type: 'TOKEN', text: reply };
  } catch (groqErr) {
    logger.error(`[AI] Groq fallback failed: ${groqErr.message}`);
    yield { type: 'TOKEN', text: 'Sorry, all AI engines are currently unavailable. Please try again later.' };
  }
}

// ─── Non-streaming wrapper ──────────────────────────────────────────────────
const processMessage = async (userId, message, context = [], imageBase64 = null) => {
  let fullText = '';
  const clientActions = [];
  for await (const chunk of streamGemini(userId, message, context, imageBase64)) {
    if (chunk.type === 'TOKEN') fullText += chunk.text;
    if (chunk.type === 'CLIENT_ACTION') clientActions.push(chunk.result);
  }
  const result = { type: 'CHAT', message: fullText };
  if (clientActions.length > 0) result.clientActions = clientActions;
  return result;
};

module.exports = { streamGemini, processMessage, SYSTEM_PROMPT };
