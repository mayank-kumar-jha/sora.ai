'use strict';

const { Queue } = require('bullmq');
const { redis: redisConfig } = require('../config/env');
const logger = require('../config/logger');

// Shared Redis connection for BullMQ
const connection = redisConfig.url;

// Queue Definitions
const aiQueue = new Queue('aiQueue', { connection });
const taskQueue = new Queue('taskQueue', { connection });
const reminderQueue = new Queue('reminderQueue', { connection });
const emailQueue = new Queue('emailQueue', { connection });
const embeddingQueue = new Queue('embeddingQueue', { connection });

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
