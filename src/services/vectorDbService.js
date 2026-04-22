'use strict';

const { Pinecone } = require('@pinecone-database/pinecone');
const config = require('../config/env');
const logger = require('../config/logger');

let pc, index;

const getIndex = () => {
  if (!config.vectorDb.apiKey || !config.vectorDb.index) return null;
  if (!pc) {
    pc = new Pinecone({ apiKey: config.vectorDb.apiKey });
    index = pc.index(config.vectorDb.index);
  }
  return index;
};

const upsert = async (id, values, metadata) => {
  const idx = getIndex();
  if (!idx || !id || !values?.length) return;

  try {
    await idx.upsert({ records: [{ id, values, metadata: metadata || {} }] });
    logger.info(`[VectorDB] Upserted vector: ${id}`);
  } catch (err) {
    logger.error(`[VectorDB] Upsert failed: ${err.message}`);
  }
};

const query = async (vector, userId, topK = 5) => {
  const idx = getIndex();
  if (!idx) return [];

  try {
    const queryPayload = {
      vector,
      topK,
      includeMetadata: true,
    };
    if (userId) queryPayload.filter = { userId: { '$eq': String(userId) } };
    
    const res = await idx.query(queryPayload);
    logger.info(`[VectorDB] Found ${res.matches.length} matches, top score: ${res.matches[0]?.score}`);
    return res.matches.map((m) => m.metadata);
  } catch (err) {
    logger.error(`[VectorDB] Query failed: ${err.message}`);
    return [];
  }
};

module.exports = { upsert, query };
