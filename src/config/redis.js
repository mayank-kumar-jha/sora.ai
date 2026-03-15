'use strict';

const Redis = require('ioredis');
const logger = require('./logger');
const { redis: redisConfig } = require('./env');

let redisClient = null;

/**
 * Common Redis options shared between main client and BullMQ
 */
const getCommonRedisOptions = () => {
    const isSsl = (redisConfig.url || '').startsWith('rediss://');
    return {
        tls: isSsl ? { rejectUnauthorized: false } : undefined,
        maxRetriesPerRequest: null, // Critical for BullMQ, safe for normal use
        enableReadyCheck: false,
        lazyConnect: false,
        connectTimeout: 15000,
        keepAlive: 15000,
        retryStrategy(times) {
            const delay = Math.min(times * 1000, 30000);
            if (times % 5 === 0) {
                logger.warn(`Redis: Reconnect attempt ${times}, delay ${delay}ms`);
            }
            return delay;
        },
        reconnectOnError(err) {
            if (err.message.includes('READONLY')) return true;
            return false;
        },
    };
};

const createRedisClient = () => {
    const options = getCommonRedisOptions();
    const client = new Redis(redisConfig.url, options);

    if (options.tls) {
        logger.info('Redis: Initializing with SSL/TLS (rejectUnauthorized: false)');
    }

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

module.exports = { getRedisClient, disconnectRedis, getCommonRedisOptions };
