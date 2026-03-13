'use strict';

const prisma = require('../config/database');
const { hashPassword, comparePassword } = require('../utils/hash');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const AppError = require('../utils/AppError');
const { getRedisClient } = require('../config/redis');
const { jwt: jwtConfig } = require('../config/env');

// Duration constants (seconds)
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

/**
 * Register a new user.
 */
const register = async ({ name, email, password }) => {
    // Check for duplicates explicitly to return a clear error message
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
        throw new AppError('An account with this email already exists.', 409, 'EMAIL_TAKEN');
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
        data: { name, email, passwordHash },
        select: { id: true, name: true, email: true, role: true, createdAt: true },
    });

    return user;
};

/**
 * Login – validate credentials, generate tokens, persist session.
 */
const login = async ({ email, password }) => {
    // Select passwordHash only for this check
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
        // Uniform error message to prevent email enumeration
        throw new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
    }

    const isValid = await comparePassword(password, user.passwordHash);
    if (!isValid) {
        throw new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
    }

    const tokenPayload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    // Persist session record
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);
    await prisma.session.create({
        data: { userId: user.id, refreshToken, expiresAt },
    });

    // Cache session in Redis for fast lookup
    const redis = getRedisClient();
    await redis.setex(`session:${user.id}:${refreshToken}`, REFRESH_TOKEN_TTL_SECONDS, user.id);

    return {
        accessToken,
        refreshToken,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
    };
};

/**
 * Refresh – exchange a valid refresh token for a new access token.
 */
const refreshTokens = async ({ refreshToken }) => {
    let decoded;
    try {
        decoded = verifyRefreshToken(refreshToken);
    } catch {
        throw new AppError('Invalid or expired refresh token.', 401, 'INVALID_REFRESH_TOKEN');
    }

    // Verify the session still exists in DB (not revoked)
    const session = await prisma.session.findFirst({
        where: {
            userId: decoded.sub,
            refreshToken,
            expiresAt: { gt: new Date() },
        },
    });

    if (!session) {
        throw new AppError('Session not found or expired. Please log in again.', 401, 'SESSION_NOT_FOUND');
    }

    const user = await prisma.user.findUnique({
        where: { id: decoded.sub },
        select: { id: true, email: true, role: true },
    });

    if (!user) {
        throw new AppError('User not found.', 401, 'USER_NOT_FOUND');
    }

    const tokenPayload = { sub: user.id, email: user.email, role: user.role };
    const newAccessToken = generateAccessToken(tokenPayload);
    const newRefreshToken = generateRefreshToken(tokenPayload);

    // Token rotation: delete old session, create new one
    await prisma.session.deleteMany({ where: { id: session.id } });
    const redis = getRedisClient();
    await redis.del(`session:${user.id}:${refreshToken}`);

    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);
    await prisma.session.create({
        data: { userId: user.id, refreshToken: newRefreshToken, expiresAt },
    });
    await redis.setex(`session:${user.id}:${newRefreshToken}`, REFRESH_TOKEN_TTL_SECONDS, user.id);

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
};

/**
 * Logout – revoke session from DB and Redis.
 */
const logout = async ({ userId, refreshToken }) => {
    await prisma.session.deleteMany({ where: { userId, refreshToken } });

    const redis = getRedisClient();
    await redis.del(`session:${userId}:${refreshToken}`);
};

module.exports = { register, login, refreshTokens, logout };
