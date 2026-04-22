'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../config/env');
const logger = require('../config/logger');

/**
 * Generate embeddings using Gemini's text-embedding-004 model.
 * Falls back to a simple hash-based approach if the API fails.
 */
const generateEmbedding = async (text) => {
  if (!text || typeof text !== 'string' || text.trim().length === 0) return null;

  // Try Gemini embedding model first
  if (config.gemini.apiKey) {
    try {
      const ai = new GoogleGenerativeAI(config.gemini.apiKey);
      const model = ai.getGenerativeModel({ model: 'gemini-embedding-001' });
      const result = await model.embedContent({
        content: { parts: [{ text }] },
        outputDimensionality: 768, // Match Pinecone index dimensions
      });
      return result.embedding.values;
    } catch (err) {
      logger.warn(`[Embedding] Gemini embedding failed, using local fallback: ${err.message}`);
    }
  }

  // Local Bag-of-Words (BoW) fallback (768 dims to match Pinecone index).
  // This maps word frequencies into vector dimensions so cosine similarity 
  // correctly matches documents with overlapping keywords.
  const DIMS = 768;
  const embedding = new Array(DIMS).fill(0);

  // Clean text and split into words
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);

  for (const word of words) {
    if (!word) continue;
    // Simple fast string hashing function
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = ((hash << 5) - hash) + word.charCodeAt(i);
      hash = hash & hash; // Convert to 32bit integer
    }
    const idx = Math.abs(hash) % DIMS;
    embedding[idx] += 1.0;
  }

  // Normalize vector to magnitude 1.0 (L2 Norm) for accurate Cosine Similarity
  const mag = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (mag > 0) {
    for (let i = 0; i < DIMS; i++) embedding[i] /= mag;
  }

  return embedding;
};

module.exports = { generateEmbedding };
