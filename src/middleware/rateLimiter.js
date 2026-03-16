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
    // Switching to In-Memory store to stay within Upstash Redis request limits.
    // This is safe for single-server deployments and saves hundreds of thousands of commands.
    return rateLimit({
        windowMs,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        message: { success: false, message },
        keyGenerator: (req) => `${keyPrefix}:${req.ip}`,
        skip: (req) => req.path === '/api/health' || req.path === '/health',
        handler: (req, res, _next, options) => {
            logger.warn('Rate limit exceeded', {
                ip: req.ip,
                path: req.path,
                method: req.method,
                keyPrefix,
            });
            res.status(options.statusCode).json(options.message);
        },
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
