'use strict';

const Groq = require('groq-sdk');
const AppError = require('../utils/AppError');

let groqClient;

const API_KEY = process.env.GROQ_API_KEY || null;

/**
 * Get Groq client instance
 */
const getGroqClient = () => {
    if (!API_KEY) {
        throw new AppError('GROQ_API_KEY is missing. Please set GROQ_API_KEY in .env.', 500, 'CONFIG_ERROR');
    }

    if (!groqClient) {
        groqClient = new Groq({ apiKey: API_KEY });
    }
    return groqClient;
};

/**
 * Generate a simple embedding for a given text using a hash-based approach.
 * Note: Groq doesn't offer an embedding API, so we use a lightweight
 * local embedding as a fallback. For production, consider a dedicated
 * embedding service.
 * @param {string} text - The text to embed
 * @returns {Promise<Array<number>>} - The vector embedding (768 dimensions)
 */
const generateEmbedding = async (text) => {
    // Guard: skip empty/null text
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
        console.warn('[EmbeddingService] Skipping empty text.');
        return null;
    }

    const DIMENSIONS = 768;
    const embedding = new Array(DIMENSIONS).fill(0);

    for (let i = 0; i < text.length; i++) {
        const charCode = text.charCodeAt(i);
        const idx = (charCode * (i + 1)) % DIMENSIONS;
        embedding[idx] += 1.0 / text.length;
    }

    // Normalize the vector
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude === 0) {
        console.warn('[EmbeddingService] Zero-magnitude vector. Skipping.');
        return null; // Pinecone rejects all-zero vectors
    }
    for (let i = 0; i < DIMENSIONS; i++) {
        embedding[i] /= magnitude;
    }

    return embedding;
};

module.exports = {
    generateEmbedding,
};
