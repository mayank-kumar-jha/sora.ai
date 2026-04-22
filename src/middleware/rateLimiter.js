'use strict';

const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis').default;
const Redis = require('ioredis');
const config = require('../config/env');
const logger = require('../config/logger');

let store = undefined;
if (config.redis.url) {
  try {
    const redisClient = new Redis(config.redis.url, { maxRetriesPerRequest: 1 });
    redisClient.on('error', (err) => logger.warn(`[Redis] RateLimiter Redis Error: ${err.message}`));
    store = new RedisStore({ sendCommand: (...args) => redisClient.call(...args) });
    logger.info('[RateLimiter] Using Redis Store');
  } catch (err) {
    logger.warn('[RateLimiter] Redis connection failed, falling back to memory store.');
  }
}

const globalRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  store: store,
  message: { success: false, error: { message: 'Too many requests', code: 'RATE_LIMITED' } },
});

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { success: false, error: { message: 'Too many auth attempts', code: 'RATE_LIMITED' } },
});

module.exports = { globalRateLimiter, authRateLimiter };
