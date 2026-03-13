'use strict';

const { Router } = require('express');
const authController = require('../controllers/authController');
const googleAuthController = require('../controllers/googleAuthController');
const { requireAuth } = require('../middleware/auth');
const { cacheMiddleware } = require('../middleware/cache');
const { authRateLimiter } = require('../middleware/rateLimiter');

const router = Router();

// Public routes – apply strict rate limiting
router.post('/register', authRateLimiter, authController.register);
router.post('/login', authRateLimiter, authController.login);
router.post('/refresh', authController.refreshToken);

// Google OAuth routes
router.get('/google', googleAuthController.redirectToGoogle);
router.get('/google/callback', googleAuthController.handleGoogleCallback);

// Protected routes
router.post('/logout', requireAuth, authController.logout);
router.get('/me', requireAuth, cacheMiddleware(300), authController.getMe);

module.exports = router;
