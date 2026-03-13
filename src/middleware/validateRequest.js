'use strict';

const AppError = require('../utils/AppError');

/**
 * Middleware to validate request data against a Zod schema
 * @param {import('zod').ZodSchema} schema - The Zod schema to validate against
 * @param {string} source - Where to find the data in the request (body, query, params)
 */
const validateRequest = (schema, source = 'body') => {
    return (req, res, next) => {
        try {
            const result = schema.safeParse(req[source]);

            if (!result.success) {
                const errors = result.error.errors.map(err => ({
                    path: err.path.join('.'),
                    message: err.message
                }));

                return next(new AppError('Validation failed', 400, 'VALIDATION_ERROR', errors));
            }

            // Replace request data with validated/parsed data
            req[source] = result.data;
            next();
        } catch (error) {
            next(error);
        }
    };
};

module.exports = validateRequest;
