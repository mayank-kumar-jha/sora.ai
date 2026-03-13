'use strict';

const authService = require('../services/authService');
const { sendSuccess, sendCreated, sendError } = require('../utils/response');
const { asyncHandler } = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');

/**
 * POST /api/auth/register
 */
const register = asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        throw new AppError('name, email, and password are required.', 400, 'VALIDATION_ERROR');
    }

    if (password.length < 8) {
        throw new AppError('Password must be at least 8 characters long.', 400, 'VALIDATION_ERROR');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        throw new AppError('Please provide a valid email address.', 400, 'VALIDATION_ERROR');
    }

    const user = await authService.register({ name, email: email.toLowerCase(), password });

    sendCreated(res, {
        message: 'Account created successfully. Please log in.',
        data: { user },
    });
});

/**
 * POST /api/auth/login
 */
const login = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        throw new AppError('email and password are required.', 400, 'VALIDATION_ERROR');
    }

    const result = await authService.login({ email: email.toLowerCase(), password });

    sendSuccess(res, {
        message: 'Login successful.',
        data: result,
    });
});

/**
 * POST /api/auth/refresh
 */
const refreshToken = asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
        throw new AppError('refreshToken is required.', 400, 'VALIDATION_ERROR');
    }

    const result = await authService.refreshTokens({ refreshToken });

    sendSuccess(res, {
        message: 'Token refreshed successfully.',
        data: result,
    });
});

/**
 * POST /api/auth/logout
 */
const logout = asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
        throw new AppError('refreshToken is required.', 400, 'VALIDATION_ERROR');
    }

    await authService.logout({ userId: req.user.id, refreshToken });

    sendSuccess(res, { message: 'Logged out successfully.' });
});

/**
 * GET /api/auth/me
 */
const getMe = asyncHandler(async (req, res) => {
    sendSuccess(res, {
        message: 'User profile retrieved.',
        data: { user: req.user },
    });
});

module.exports = { register, login, refreshToken, logout, getMe };
