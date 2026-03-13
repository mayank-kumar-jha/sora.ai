'use strict';

const googleAuthService = require('../services/googleAuthService');
const { sendSuccess } = require('../utils/response');
const { asyncHandler } = require('../utils/asyncHandler');

/**
 * GET /api/auth/google
 * Redirect to Google consent screen
 */
const redirectToGoogle = asyncHandler(async (req, res) => {
    // When opened from browser (Linking.openURL), we might not have the header
    // so we pass it as a query param from the app
    const userId = req.user?.id || req.query.userId;
    
    if (!userId) {
        throw new AppError('User ID is required for Google account linking.', 400, 'USER_ID_REQUIRED');
    }

    const url = googleAuthService.getAuthUrl(userId);
    res.redirect(url);
});

/**
 * GET /api/auth/google/callback
 * Handle Google OAuth callback
 */
const handleGoogleCallback = asyncHandler(async (req, res) => {
    const { code, state } = req.query;

    if (!code) {
        return res.status(400).json({
            status: 'error',
            message: 'Authorization code is required.'
        });
    }

    // Link account
    await googleAuthService.handleCallback(code, state);

    // Redirect back to mobile app
    res.redirect('mobile://google-success');
});

module.exports = {
    redirectToGoogle,
    handleGoogleCallback
};
