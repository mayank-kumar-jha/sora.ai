'use strict';

const Redis = require('ioredis');
const logger = require('./logger');
const { redis: redisConfig } = require('./env');

// Global flag to suspend Redis operations if limits are hit
let isRedisSuspended = false;
let suspensionTimer = null;
let redisClient = null;

const suspendRedis = (durationMs = 5 * 60 * 1000) => {
    if (isRedisSuspended) return;
    isRedisSuspended = true;
    logger.error(`REDIS CIRCUIT BREAKER TRIGGERED: Suspending all Redis operations for ${durationMs / 60000} minutes due to request limits.`);

    if (suspensionTimer) clearTimeout(suspensionTimer);
    suspensionTimer = setTimeout(() => {
        isRedisSuspended = false;
        logger.info('REDIS CIRCUIT BREAKER RESET: Attempting to resume Redis operations.');
    }, durationMs);
};

const getRedisSuspended = () => isRedisSuspended;

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
            if (isRedisSuspended) return null; // Stop retrying if suspended
            const delay = Math.min(times * 1000, 30000);
            if (times % 5 === 0) {
                logger.warn(`Redis: Reconnect attempt ${times}, delay ${delay}ms`);
            }
            return delay;
        },
        reconnectOnError(err) {
            if (err.message.includes('READONLY')) return true;
            if (err.message.includes('max requests limit exceeded')) {
                suspendRedis();
                return false; // Don't reconnect immediately
            }
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
    client.on('error', (err) => {
        if (err.message.includes('max requests limit exceeded')) {
            suspendRedis();
        }
        logger.error('Redis: Client error', { error: err.message });
    });
    client.on('close', () => logger.warn('Redis: Connection closed'));
    client.on('reconnecting', () => logger.info('Redis: Reconnecting...'));
    client.on('end', () => logger.warn('Redis: Connection ended'));

    return client;
};

const getRedisClient = () => {
    if (isRedisSuspended) return null;
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

module.exports = { getRedisClient, disconnectRedis, getCommonRedisOptions, getRedisSuspended };
