'use strict';

const jwt = require('jsonwebtoken');
const { jwt: jwtConfig } = require('../config/env');

/**
 * Generate a short-lived JWT access token.
 */
const generateAccessToken = (payload) =>
    jwt.sign(payload, jwtConfig.secret, { expiresIn: jwtConfig.expiresIn, algorithm: 'HS256' });

/**
 * Generate a long-lived JWT refresh token.
 */
const generateRefreshToken = (payload) =>
    jwt.sign(payload, jwtConfig.refreshSecret, { expiresIn: jwtConfig.refreshExpiresIn, algorithm: 'HS256' });

/**
 * Verify an access token. Throws JsonWebTokenError / TokenExpiredError on failure.
 */
const verifyAccessToken = (token) => jwt.verify(token, jwtConfig.secret);

/**
 * Verify a refresh token. Throws on failure.
 */
const verifyRefreshToken = (token) => jwt.verify(token, jwtConfig.refreshSecret);

module.exports = {
    generateAccessToken,
    generateRefreshToken,
    verifyAccessToken,
    verifyRefreshToken,
};
