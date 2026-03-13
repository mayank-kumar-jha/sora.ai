'use strict';

const prisma = require('../config/database');
const AppError = require('../utils/AppError');

const ROLE_LIMITS = {
    FREE: {
        AI_MESSAGES: 50,
        TASKS: 20,
        STORAGE_BYTES: 100 * 1024 * 1024 // 100MB
    },
    PRO: {
        AI_MESSAGES: 5000,
        TASKS: 1000,
        STORAGE_BYTES: 10 * 1024 * 1024 * 1024 // 10GB
    },
    ADMIN: {
        AI_MESSAGES: Infinity,
        TASKS: Infinity,
        STORAGE_BYTES: Infinity
    }
};

/**
 * Check if user has exceeded their quota for a resource
 * @param {string} userId 
 * @param {string} resource - 'AI_MESSAGES' | 'TASKS' | 'STORAGE_BYTES'
 * @param {number} additionalUsage - Amount to add to current usage
 */
const checkQuota = async (userId, resource, additionalUsage = 1) => {
    const user = await prisma.user.findUnique({
        where: { id: userId }
    });

    if (!user) {
        throw new AppError('User not found', 404);
    }

    const limits = ROLE_LIMITS[user.role];
    let currentUsage;

    switch (resource) {
        case 'AI_MESSAGES':
            currentUsage = user.aiUsageCount;
            break;
        case 'TASKS':
            currentUsage = user.taskCount;
            break;
        case 'STORAGE_BYTES':
            currentUsage = Number(user.storageUsageBytes);
            break;
        default:
            throw new AppError('Invalid resource type', 400);
    }

    if (currentUsage + additionalUsage > limits[resource]) {
        throw new AppError(`Quota exceeded for ${resource}. Please upgrade to PRO for higher limits.`, 403, 'QUOTA_EXCEEDED');
    }

    return true;
};

/**
 * Increment usage for a user
 */
const incrementUsage = async (userId, resource, amount = 1) => {
    const data = {};
    switch (resource) {
        case 'AI_MESSAGES':
            data.aiUsageCount = { increment: amount };
            break;
        case 'TASKS':
            data.taskCount = { increment: amount };
            break;
        case 'STORAGE_BYTES':
            data.storageUsageBytes = { increment: amount };
            break;
        default:
            throw new AppError('Invalid resource type', 400);
    }

    await prisma.user.update({
        where: { id: userId },
        data
    });
};

module.exports = {
    checkQuota,
    incrementUsage,
    ROLE_LIMITS
};
