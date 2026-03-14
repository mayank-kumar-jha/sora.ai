'use strict';

const Redis = require('ioredis');
const logger = require('./logger');
const { redis: redisConfig } = require('./env');

let redisClient = null;

const createRedisClient = () => {
    const client = new Redis(redisConfig.url, {
        maxRetriesPerRequest: null, // Critical for BullMQ
        enableReadyCheck: false,
        lazyConnect: false,
        connectTimeout: 10000,
        retryStrategy(times) {
            const delay = Math.min(times * 50, 2000);
            if (times % 10 === 0) {
                logger.warn(`Redis: Reconnect attempt ${times}, delay ${delay}ms`);
            }
            return delay;
        },
        reconnectOnError(err) {
            const targetError = 'READONLY';
            if (err.message.includes(targetError) || err.message.includes('ECONNRESET')) {
                return true; // Reconnect for these specific errors
            }
            return false;
        },
    });

    client.on('connect', () => logger.info('Redis: Connection established'));
    client.on('ready', () => logger.info('Redis: Client is ready'));
    client.on('error', (err) => logger.error('Redis: Client error', { error: err.message }));
    client.on('close', () => logger.warn('Redis: Connection closed'));
    client.on('reconnecting', () => logger.info('Redis: Reconnecting...'));
    client.on('end', () => logger.warn('Redis: Connection ended'));

    return client;
};

const getRedisClient = () => {
    if (!redisClient) {
        redisClient = createRedisClient();
    }
    return redisClient;
};

const disconnectRedis = async () => {
    if (redisClient) {
        await redisClient.quit();
        redisClient = null;
        logger.info('Redis: Disconnected gracefully');
    }
};

module.exports = { getRedisClient, disconnectRedis };
