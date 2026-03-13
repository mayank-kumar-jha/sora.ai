'use strict';

const { google } = require('googleapis');
const prisma = require('../config/database');
const { encrypt, decrypt } = require('../utils/crypto');
const googleConfig = require('../config/google');
const AppError = require('../utils/AppError');

const oauth2Client = new google.auth.OAuth2(
    googleConfig.clientId,
    googleConfig.clientSecret,
    googleConfig.redirectUri
);

/**
 * Get decrypted tokens for a user
 */
const getTokens = async (userId) => {
    const tokenRecord = await prisma.googleToken.findUnique({
        where: { userId }
    });

    if (!tokenRecord) {
        throw new AppError('Google account not linked.', 401, 'GOOGLE_NOT_LINKED');
    }

    return {
        accessToken: decrypt(tokenRecord.accessToken),
        refreshToken: tokenRecord.refreshToken ? decrypt(tokenRecord.refreshToken) : null,
        expiry: tokenRecord.expiry
    };
};

/**
 * Refresh Google Access Token
 */
const refreshAccessToken = async (userId) => {
    const tokens = await getTokens(userId);

    if (!tokens.refreshToken) {
        throw new AppError('Refresh token missing. Please re-authenticate.', 401, 'GOOGLE_REFRESH_TOKEN_MISSING');
    }

    oauth2Client.setCredentials({
        refresh_token: tokens.refreshToken
    });

    try {
        const { credentials } = await oauth2Client.refreshAccessToken();

        const encryptedAccessToken = encrypt(credentials.access_token);
        const expiryDate = new Date(credentials.expiry_date);

        await prisma.googleToken.update({
            where: { userId },
            data: {
                accessToken: encryptedAccessToken,
                expiry: expiryDate
            }
        });

        return credentials.access_token;
    } catch (error) {
        console.error('Error refreshing Google token:', error);
        throw new AppError('Failed to refresh Google access token.', 401, 'GOOGLE_REFRESH_ERROR');
    }
};

/**
 * Get valid access token (refreshes if needed)
 */
const getValidAccessToken = async (userId) => {
    const tokens = await getTokens(userId);

    // Check if expired (with 1 minute buffer)
    if (new Date() >= new Date(tokens.expiry.getTime() - 60000)) {
        return await refreshAccessToken(userId);
    }

    return tokens.accessToken;
};

module.exports = {
    getTokens,
    refreshAccessToken,
    getValidAccessToken
};
