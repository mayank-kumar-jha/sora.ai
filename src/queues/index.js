'use strict';

const { Queue } = require('bullmq');
const { redis: redisConfig } = require('../config/env');
const logger = require('../config/logger');

const Redis = require('ioredis');
const { getCommonRedisOptions, getRedisSuspended } = require('../config/redis');

logger.info(`Queues: Using Redis URL length=${(redisConfig.url || '').length}`);

// Dedicated Redis instance for BullMQ (Required to have maxRetriesPerRequest: null)
const connection = new Redis(redisConfig.url, getCommonRedisOptions());

connection.on('error', (err) => {
    logger.error('Queues: Redis connection error', { error: err.message });
});

const mainQueue = new Queue('mainQueue', { connection });

/**
 * Safe wrapper to add jobs to the queue.
 * name: The job type (e.g. 'EXECUTE_TASK', 'TRIGGER_REMINDER')
 * data: The job payload
 * options: BullMQ options (like jobId for de-duplication)
 */
const addJob = async (name, data, options = {}) => {
    if (getRedisSuspended()) {
        logger.warn(`Redis: Skipping job ${name} - Circuit breaker is active`);
        return;
    }
    try {
        await mainQueue.add(name, data, {
            removeOnComplete: true,
            removeOnFail: 1000,
            ...options
        });
        logger.info(`Job added to mainQueue: ${name}`);
    } catch (err) {
        logger.warn(`Failed to add job ${name} to mainQueue`, { error: err.message });
    }
};

const queues = {
    main: mainQueue,
    // Add legacy naming for safety during transition
    aiQueue: mainQueue,
    taskQueue: mainQueue,
    reminderQueue: mainQueue,
    emailQueue: mainQueue,
    embeddingQueue: mainQueue
};

logger.info('BullMQ Consolidated Queue initialized');

module.exports = {
    queues,
    addJob,
    connection
};
