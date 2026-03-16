'use strict';

const { getRedisClient } = require('../config/redis');
const logger = require('../config/logger');

/**
 * Cache middleware for Express routes
 * @param {number} duration - Cache duration in seconds
 */
const cacheMiddleware = (duration = 60) => {
    return async (req, res, next) => {
        if (req.method !== 'GET') {
            return next();
        }

        const key = `cache:${req.originalUrl || req.url}`;
        const redis = getRedisClient();

        try {
            const cachedResponse = await redis.get(key);

            if (cachedResponse) {
                logger.debug(`Cache hit for ${key}`);
                return res.status(200).json(JSON.parse(cachedResponse));
            }
        } catch (error) {
            logger.warn('Redis Cache Get Error - proceeding without cache', { error: error.message, key });
        }

        try {
            // Patch res.json to store the response in Redis
            const originalJson = res.json;
            res.json = (body) => {
                res.json = originalJson;
                redis.setex(key, duration, JSON.stringify(body)).catch(err => {
                    logger.warn('Redis Cache Set Error', { error: err.message, key });
                });
                return originalJson.call(res, body);
            };

            next();
        } catch (error) {
            logger.error('Error during cache middleware next() or setup', { error: error.message, key });
            next();
        }
    };
};

/**
 * Clear cache for a specific pattern (e.g., when data changes)
 */
const clearCache = async (pattern) => {
    const redis = getRedisClient();
    try {
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
            await redis.del(...keys);
        }
    } catch (error) {
        logger.error('Redis Cache Clear Error', { error: error.message, pattern });
    }
};

module.exports = {
    cacheMiddleware,
    clearCache
};
