'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config/env');
const AppError = require('../utils/AppError');

const authenticate = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(new AppError('Authentication required', 401, 'AUTH_REQUIRED'));
  }

  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, config.jwt.secret);
    req.user = { id: decoded.sub || decoded.id, email: decoded.email, role: decoded.role };
    next();
  } catch (err) {
    return next(new AppError('Invalid or expired token', 401, 'INVALID_TOKEN'));
  }
};

module.exports = { authenticate };
