'use strict';

const { Worker } = require('bullmq');
const { connection } = require('../queues');
const embeddingService = require('../services/embeddingService');
const vectorDbService = require('../services/vectorDbService');
const prisma = require('../config/database');
const logger = require('../config/logger');
const { v4: uuidv4 } = require('uuid');

const embeddingWorker = new Worker('embeddingQueue', async (job) => {
    const { userId, text, source } = job.data;
    logger.info(`Processing embedding job ${job.id} for user ${userId}`);

    try {
        const vectorId = uuidv4();
        const embedding = await embeddingService.generateEmbedding(text);

        // Guard: skip if embedding is null or empty (e.g. embedding service failed)
        if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
            logger.warn(`Embedding job ${job.id} skipped: generateEmbedding returned empty vector for user ${userId}`);
            return;
        }

        await vectorDbService.upsertVector(vectorId, embedding, {
            userId,
            text,
            timestamp: new Date().toISOString(),
            source
        });

        await prisma.embeddingMetadata.create({
            data: {
                userId,
                vectorId,
                source
            }
        });

        logger.info(`Embedding stored successfully for user ${userId}`);
    } catch (error) {
        logger.error(`Embedding job ${job.id} failed`, { error: error.message });
        throw error;
    }
}, { connection });

module.exports = embeddingWorker;
