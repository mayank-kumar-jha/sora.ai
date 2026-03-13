'use strict';

const { verifyAccessToken } = require('../utils/jwt');
const AppError = require('../utils/AppError');
const prisma = require('../config/database');
const { asyncHandler } = require('../utils/asyncHandler');

/**
 * requireAuth – verifies the Bearer JWT and attaches req.user.
 */
const requireAuth = asyncHandler(async (req, _res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new AppError('Authentication required. Please provide a valid Bearer token.', 401, 'UNAUTHORIZED');
    }

    const token = authHeader.split(' ')[1];

    let decoded;
    try {
        decoded = verifyAccessToken(token);
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            throw new AppError('Token has expired. Please refresh your session.', 401, 'TOKEN_EXPIRED');
        }
        throw new AppError('Invalid authentication token.', 401, 'INVALID_TOKEN');
    }

    // Re-fetch user to ensure they still exist and are active
    const user = await prisma.user.findUnique({
        where: { id: decoded.sub },
        select: { id: true, email: true, name: true, role: true },
    });

    if (!user) {
        throw new AppError('User account not found or has been deleted.', 401, 'USER_NOT_FOUND');
    }

    req.user = user;
    next();
});

/**
 * requirePro – user must have PRO or ADMIN role.
 * Always chain after requireAuth.
 */
const requirePro = (req, _res, next) => {
    if (!req.user) {
        return next(new AppError('Authentication required.', 401, 'UNAUTHORIZED'));
    }
    if (req.user.role !== 'PRO' && req.user.role !== 'ADMIN') {
        return next(new AppError('This feature requires a Pro subscription.', 403, 'FORBIDDEN_PRO_REQUIRED'));
    }
    next();
};

/**
 * requireAdmin – user must have ADMIN role.
 * Always chain after requireAuth.
 */
const requireAdmin = (req, _res, next) => {
    if (!req.user) {
        return next(new AppError('Authentication required.', 401, 'UNAUTHORIZED'));
    }
    if (req.user.role !== 'ADMIN') {
        return next(new AppError('Admin access required.', 403, 'FORBIDDEN_ADMIN_REQUIRED'));
    }
    next();
};

module.exports = { requireAuth, requirePro, requireAdmin };
