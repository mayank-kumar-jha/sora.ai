'use strict';

const { google } = require('googleapis');
const googleConfig = require('../config/google');
const prisma = require('../config/database');
const { encrypt } = require('../utils/crypto');
const { generateAccessToken, generateRefreshToken } = require('../utils/jwt');
const AppError = require('../utils/AppError');
const { getRedisClient } = require('../config/redis');

const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

const oauth2Client = new google.auth.OAuth2(
    googleConfig.clientId,
    googleConfig.clientSecret,
    googleConfig.redirectUri
);

/**
 * Generate Google Auth URL
 */
const getAuthUrl = (userId) => {
    return oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: googleConfig.scopes,
        state: userId // Pass userId so we know who to link the tokens to
    });
};

/**
 * Handle Google OAuth Callback
 */
const handleCallback = async (code, state) => {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();

    if (!userInfo.email) {
        throw new AppError('Google account does not have an email associated.', 400, 'GOOGLE_AUTH_ERROR');
    }

    // 1. Find or create user
    const userId = state; // The userId passed from mobile
    let user = await prisma.user.findUnique({
        where: { id: userId }
    });

    if (!user) {
        throw new AppError('User not found. Cannot link Google account.', 404, 'USER_NOT_FOUND');
    }

    // 2. Store Google Tokens
    const encryptedAccessToken = encrypt(tokens.access_token);
    const encryptedRefreshToken = tokens.refresh_token ? encrypt(tokens.refresh_token) : null;
    const expiryDate = new Date(tokens.expiry_date);

    await prisma.googleToken.upsert({
        where: { userId: user.id },
        update: {
            accessToken: encryptedAccessToken,
            refreshToken: encryptedRefreshToken || undefined, // Keep existing if not provided
            expiry: expiryDate
        },
        create: {
            userId: user.id,
            accessToken: encryptedAccessToken,
            refreshToken: encryptedRefreshToken || '', // Should be provided on first login
            expiry: expiryDate
        }
    });

    // 3. Generate internal JWT (Phase 1 compatibility)
    const tokenPayload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    // Persist session
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);
    await prisma.session.create({
        data: { userId: user.id, refreshToken, expiresAt },
    });

    // Cache session
    const redis = getRedisClient();
    await redis.setex(`session:${user.id}:${refreshToken}`, REFRESH_TOKEN_TTL_SECONDS, user.id);

    return {
        accessToken,
        refreshToken,
        user: { id: user.id, name: user.name, email: user.email, role: user.role }
    };
};

module.exports = {
    getAuthUrl,
    handleCallback
};
