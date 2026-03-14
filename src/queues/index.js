'use strict';

const { Queue } = require('bullmq');
const { redis: redisConfig } = require('../config/env');
const logger = require('../config/logger');

// Shared Redis connection for BullMQ
if (!redisConfig.url) {
    logger.error('CRITICAL: REDIS_URL is missing in queues/index.js!');
}

const connection = {
    url: redisConfig.url,
    maxRetriesPerRequest: null
};

// Queue Definitions
const aiQueue = new Queue('aiQueue', { 
    connection: connection.url, 
    defaultJobOptions: { removeOnComplete: true } 
});
const taskQueue = new Queue('taskQueue', { 
    connection: connection.url,
    defaultJobOptions: { removeOnComplete: true }
});
const reminderQueue = new Queue('reminderQueue', { connection: connection.url, defaultJobOptions: { removeOnComplete: true } });
const emailQueue = new Queue('emailQueue', { connection: connection.url, defaultJobOptions: { removeOnComplete: true } });
const embeddingQueue = new Queue('embeddingQueue', { connection: connection.url, defaultJobOptions: { removeOnComplete: true } });

const queues = {
    ai: aiQueue,
    task: taskQueue,
    reminder: reminderQueue,
    email: emailQueue,
    embedding: embeddingQueue
};

logger.info('BullMQ Queues initialized');

module.exports = {
    queues,
    connection
};
