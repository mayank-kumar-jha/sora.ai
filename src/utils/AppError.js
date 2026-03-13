'use strict';

/**
 * AppError – structured error class used throughout the application.
 *
 * Usage:
 *   throw new AppError('Not found', 404);
 *   throw new AppError('Forbidden', 403, 'FORBIDDEN');
 */
class AppError extends Error {
    constructor(message, statusCode = 500, code = null) {
        super(message);
        this.name = 'AppError';
        this.statusCode = statusCode;
        this.code = code || `HTTP_${statusCode}`;
        this.isOperational = true; // distinguishes expected vs unexpected errors

        Error.captureStackTrace(this, this.constructor);
    }
}

module.exports = AppError;
