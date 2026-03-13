'use strict';

/**
 * Standardised API response helpers.
 * All responses follow a consistent { success, message, data } shape.
 */

const sendSuccess = (res, { statusCode = 200, message = 'Success', data = null } = {}) => {
    const body = { success: true, message };
    if (data !== null) body.data = data;
    return res.status(statusCode).json(body);
};

const sendError = (res, { statusCode = 500, message = 'Internal Server Error', errors = null } = {}) => {
    const body = { success: false, message };
    if (errors !== null) body.errors = errors;
    return res.status(statusCode).json(body);
};

const sendCreated = (res, { message = 'Resource created', data = null } = {}) =>
    sendSuccess(res, { statusCode: 201, message, data });

const sendNoContent = (res) => res.status(204).send();

module.exports = { sendSuccess, sendError, sendCreated, sendNoContent };
