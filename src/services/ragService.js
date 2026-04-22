'use strict';

const { v4: uuidv4 } = require('uuid');
const embeddingService = require('./embeddingService');
const vectorDbService = require('./vectorDbService');
const prisma = require('../config/database');
const logger = require('../config/logger');

/**
 * Ingest text content into the RAG system (embed + store in Pinecone)
 */
const ingest = async (userId, text, source = 'upload', filename = 'document') => {
  if (!text || text.trim().length < 10) return null;

  const embedding = await embeddingService.generateEmbedding(text);
  if (!embedding) return null;

  const vectorId = `doc-${uuidv4()}`;

  await vectorDbService.upsert(vectorId, embedding, {
    userId,
    text: text.slice(0, 2000), // Store first 2000 chars as metadata
    source,
    filename,
  });

  // Save reference in DB (skip if userId isn't a valid UUID — e.g. test sessions)
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(userId)) {
    logger.info(`[RAG] Ingested vector-only (non-UUID userId): ${filename} → ${vectorId}`);
    return { vectorId, filename };
  }

  const doc = await prisma.document.create({
    data: { userId, filename, source, vectorId, content: text.slice(0, 5000) },
  });

  logger.info(`[RAG] Ingested document: ${filename} → ${vectorId}`);
  return doc;
};

/**
 * Query the knowledge base for relevant context
 */
const query = async (queryText, userId) => {
  const embedding = await embeddingService.generateEmbedding(queryText);
  if (!embedding) return 'No relevant information found.';

  const matches = await vectorDbService.query(embedding, userId);
  if (matches.length === 0) return 'No relevant personal information found.';

  return matches.map((m) => m.text).join('\n---\n');
};

/**
 * Parse PDF and extract text
 */
const parsePdf = async (buffer) => {
  try {
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(buffer);
    return data.text;
  } catch (err) {
    logger.error(`[RAG] PDF parse failed: ${err.message}`);
    return null;
  }
};

module.exports = { ingest, query, parsePdf };
