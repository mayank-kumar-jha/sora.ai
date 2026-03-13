'use strict';

const { Worker } = require('bullmq');
const { connection } = require('../queues');
const agentService = require('../services/agentService');
const logger = require('../config/logger');

const aiWorker = new Worker('aiQueue', async (job) => {
    const { userId, message, context } = job.data;
    logger.info(`Processing AI job ${job.id} for user ${userId}`);

    try {
        const result = await agentService.processMessage(userId, message, context);
        logger.info(`AI processing completed for user ${userId}`);

        // Push result to WebSocket (Phase 8)
        // This will be used for non-streaming background tasks
        return result;
    } catch (error) {
        logger.error(`AI job ${job.id} failed`, { error: error.message });
        throw error;
    }
}, { connection });

module.exports = aiWorker;
