'use strict';

const logger = require('../config/logger');
const { nodeEnv } = require('../config/env');
const AppError = require('../utils/AppError');

/**
 * Global error handling middleware.
 * Must be registered LAST in the Express middleware chain.
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
    // Normalise to AppError shape
    const isOperational = err instanceof AppError && err.isOperational;
    const statusCode = err.statusCode || 500;
    const code = err.code || 'INTERNAL_SERVER_ERROR';

    // Always log the error
    if (statusCode >= 500) {
        logger.error('Unhandled server error', {
            message: err.message,
            code,
            status: statusCode,
            path: req.path,
            method: req.method,
            stack: nodeEnv !== 'production' ? err.stack : undefined,
        });
    } else {
        logger.warn('Client error', {
            message: err.message,
            code,
            status: statusCode,
            path: req.path,
            method: req.method,
        });
    }

    // Handle Prisma known request errors
    if (err.code === 'P2002') {
        return res.status(409).json({
            success: false,
            message: 'A record with this value already exists.',
            code: 'DUPLICATE_ENTRY',
        });
    }

    // Handle JWT-specific errors (fallthrough from non-middleware usage)
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({ success: false, message: 'Invalid token.', code: 'INVALID_TOKEN' });
    }
    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ success: false, message: 'Token expired.', code: 'TOKEN_EXPIRED' });
    }

    // For non-operational errors in production, hide implementation details
    const responseMessage =
        isOperational || nodeEnv !== 'production' ? err.message : 'An unexpected error occurred. Please try again.';

    return res.status(statusCode).json({
        success: false,
        message: responseMessage,
        code,
        ...(nodeEnv !== 'production' && !isOperational && { stack: err.stack }),
    });
};

/**
 * 404 handler – catches any request that doesn't match a registered route.
 */
const notFoundHandler = (req, res) => {
    res.status(404).json({
        success: false,
        message: `Cannot ${req.method} ${req.path}`,
        code: 'ROUTE_NOT_FOUND',
    });
};

module.exports = { errorHandler, notFoundHandler };
