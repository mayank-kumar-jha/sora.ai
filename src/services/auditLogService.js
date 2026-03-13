'use strict';

const prisma = require('../config/database');
const logger = require('../config/logger');

/**
 * Record an audit log entry
 * @param {Object} data - Log data
 * @param {string} data.userId - ID of the user performing the action
 * @param {string} data.action - Action name (e.g., 'LOGIN', 'PAYMENT_SUCCESS')
 * @param {string} data.resource - Impacted resource (e.g., 'Task:123')
 * @param {Object} data.metadata - Additional context
 * @param {string} data.ipAddress - User's IP address
 */
const recordAuditLog = async ({ userId, action, resource, metadata, ipAddress }) => {
    try {
        await prisma.auditLog.create({
            data: {
                userId,
                action,
                resource,
                metadata,
                ipAddress
            }
        });
    } catch (error) {
        logger.error('Failed to record audit log', { error: error.message, action, userId });
        // Don't throw here to avoid blocking main flow
    }
};

module.exports = {
    recordAuditLog
};
