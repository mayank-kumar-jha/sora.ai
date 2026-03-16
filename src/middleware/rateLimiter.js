'use strict';

const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { getRedisClient } = require('../config/redis');
const logger = require('../config/logger');

/**
 * Factory to create a rate limiter.
 * Attempts to use Redis store; falls back to in-memory if Redis is unavailable.
 */
const createLimiter = ({ windowMs, max, message, keyPrefix }) => {
    let store;

    try {
        const client = getRedisClient();
        // Only attach Redis store if the client is in a connected/ready state
        if (client.status === 'ready' || client.status === 'connect') {
            store = new RedisStore({
                sendCommand: async (...args) => {
                    try {
                        return await client.call(...args);
                    } catch (err) {
                        logger.warn(`Rate limiter Redis command failed - falling back to permissive mode`, { error: err.message });
                        // Return something that doesn't crash the request
                        // Most rate limiters will treat an error as "0 count" or "success" if handled this way
                        return null; 
                    }
                },
                prefix: `rl:${keyPrefix}:`,
            });
        }
    } catch (err) {
        logger.warn(`Rate limiter [${keyPrefix}]: Redis store creation failed, using in-memory store`, {
            error: err.message,
        });
    }

    return rateLimit({
        windowMs,
        max,
        standardHeaders: true,   // Return RateLimit-* headers
        legacyHeaders: false,
        message: { success: false, message },
        keyGenerator: (req) => `${keyPrefix}:${req.ip}`,
        handler: (req, res, _next, options) => {
            logger.warn('Rate limit exceeded', {
                ip: req.ip,
                path: req.path,
                method: req.method,
                keyPrefix,
            });
            res.status(options.statusCode).json(options.message);
        },
        // If store is undefined, express-rate-limit uses its built-in in-memory store
        ...(store && { store }),
    });
};

/**
 * Global API rate limiter – applied to every request.
 * 200 requests per 15 minutes per IP.
 */
const globalRateLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: 'Too many requests. Please try again later.',
    keyPrefix: 'global',
});

/**
 * Auth rate limiter – stricter, applied only to login/register endpoints.
 * 10 attempts per 15 minutes per IP.
 */
const authRateLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    max: 50,
    message: 'Too many authentication attempts. Please try again in 15 minutes.',
    keyPrefix: 'auth',
});

module.exports = { globalRateLimiter, authRateLimiter };
