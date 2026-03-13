'use strict';

const Redis = require('ioredis');
const logger = require('./logger');
const { redis: redisConfig } = require('./env');

let redisClient = null;

const createRedisClient = () => {
    const client = new Redis(redisConfig.url, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: false,
        retryStrategy(times) {
            if (times > 5) {
                logger.error('Redis: Max reconnect attempts reached. Giving up.');
                return null;
            }
            const delay = Math.min(times * 200, 2000);
            logger.warn(`Redis: Reconnecting in ${delay}ms (attempt ${times})`);
            return delay;
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
