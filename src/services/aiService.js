'use strict';

const Groq = require('groq-sdk');
const { gemini: aiConfig } = require('../config/env');
const AppError = require('../utils/AppError');

let groqClient;

// Use GROQ_API_KEY from env, fallback to GEMINI_API_KEY field for backward compat
const API_KEY = process.env.GROQ_API_KEY || null;
const MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

/**
 * Get Groq client instance
 */
const getClient = () => {
    if (!API_KEY) {
        return null;
    }

    if (!groqClient) {
        groqClient = new Groq({ apiKey: API_KEY });
    }
    return groqClient;
};

/**
 * Helper: wait for a given number of ms
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Check if an error is a rate-limit (429) error
 */
const isRateLimitError = (error) =>
    error.status === 429 ||
    error.message?.includes('429') ||
    error.message?.includes('rate_limit');

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 5000;

/**
 * Get Chat Completion from Groq (OpenAI-compatible API)
 * @param {Array} messages - Array of message objects ({ role, content })
 * @param {Object} options - Additional options
 */
const getChatCompletion = async (messages, options = {}) => {
    const client = getClient();

    if (!client) {
        console.warn('GROQ_API_KEY is missing. Returning mock AI response.');
        return JSON.stringify({
            type: 'CHAT',
            message: "I am running in mock mode because the GROQ_API_KEY is missing. Please configure GROQ_API_KEY in the backend .env file. Get a free key at https://console.groq.com/keys"
        });
    }

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await client.chat.completions.create({
                model: MODEL,
                messages,
                response_format: { type: 'json_object' },
                ...options,
            });

            return response.choices[0].message.content;
        } catch (error) {
            if (isRateLimitError(error) && attempt < MAX_RETRIES) {
                const delay = BASE_DELAY_MS * attempt;
                console.warn(`Groq rate limited (attempt ${attempt}/${MAX_RETRIES}). Retrying in ${delay / 1000}s...`);
                await sleep(delay);
                continue;
            }

            if (isRateLimitError(error)) {
                console.warn(`Groq rate limited after ${MAX_RETRIES} attempts.`);
                return JSON.stringify({
                    thought: "I am hitting a rate limit on the free tier.",
                    type: 'CHAT',
                    message: "I'm currently experiencing high demand. Please wait a moment and try again."
                });
            }

            console.error('Groq Error:', error);
            throw new AppError(`AI service error: ${error.message}`, 500, 'AI_SERVICE_ERROR');
        }
    }
};

/**
 * Get Streaming Chat Completion from Groq
 * @param {Array} messages - Array of message objects
 */
const getStreamingCompletion = async (messages) => {
    const client = getClient();

    if (!client) {
        console.warn('GROQ_API_KEY is missing. Returning mock AI stream.');
        return (async function* () {
            yield { choices: [{ delta: { content: "I am running in mock mode. Please configure GROQ_API_KEY in .env. Get a free key at https://console.groq.com/keys" } }] };
        })();
    }

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const stream = await client.chat.completions.create({
                model: MODEL,
                messages,
                stream: true,
            });

            return (async function* () {
                for await (const chunk of stream) {
                    const content = chunk.choices[0]?.delta?.content;
                    if (content) {
                        yield { choices: [{ delta: { content } }] };
                    }
                }
            })();
        } catch (error) {
            if (isRateLimitError(error) && attempt < MAX_RETRIES) {
                const delay = BASE_DELAY_MS * attempt;
                console.warn(`Groq stream rate limited (attempt ${attempt}/${MAX_RETRIES}). Retrying in ${delay / 1000}s...`);
                await sleep(delay);
                continue;
            }

            if (isRateLimitError(error)) {
                return (async function* () {
                    yield { choices: [{ delta: { content: "Rate limited. Please wait a moment and try again." } }] };
                })();
            }

            console.error('Groq Streaming Error:', error);
            throw new AppError(`AI streaming error: ${error.message}`, 500, 'AI_STREAMING_ERROR');
        }
    }
};

module.exports = {
    getChatCompletion,
    getStreamingCompletion,
};
