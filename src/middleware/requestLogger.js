'use strict';

const logger = require('../config/logger');

/**
 * HTTP request logger middleware.
 * Logs method, URL, status code, and response time.
 */
const requestLogger = (req, res, next) => {
    const startTime = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - startTime;
        const logData = {
            method: req.method,
            url: req.originalUrl,
            status: res.statusCode,
            duration: `${duration}ms`,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
        };

        if (req.user) {
            logData.userId = req.user.id;
        }

        if (res.statusCode >= 500) {
            logger.error('Request completed with server error', logData);
        } else if (res.statusCode >= 400) {
            logger.warn('Request completed with client error', logData);
        } else {
            logger.http('Request completed', logData);
        }
    });

    next();
};

module.exports = { requestLogger };
