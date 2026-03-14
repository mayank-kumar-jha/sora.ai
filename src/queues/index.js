'use strict';

const { Queue } = require('bullmq');
const { redis: redisConfig } = require('../config/env');
const logger = require('../config/logger');

const Redis = require('ioredis');

// Dedicted Redis instance for BullMQ (Required to have maxRetriesPerRequest: null)
const connection = new Redis(redisConfig.url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false
});

connection.on('error', (err) => {
    logger.error('Queues: Redis connection error', { error: err.message });
});

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

logger.info('BullMQ Queues initialized with dedicated connection');

module.exports = {
    queues,
    connection
};
