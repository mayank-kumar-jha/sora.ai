'use strict';

const logger = require('../config/logger');

const errorHandler = (err, req, res, _next) => {
  const statusCode = err.statusCode || 500;
  const message = err.isOperational ? err.message : 'Internal Server Error';

  if (statusCode >= 500) {
    logger.error(`${req.method} ${req.path} → ${statusCode}: ${err.message}`, { stack: err.stack });
  } else {
    logger.warn(`${req.method} ${req.path} → ${statusCode}: ${err.message}`);
  }

  res.status(statusCode).json({
    success: false,
    error: { message, code: err.code || 'INTERNAL_ERROR' },
  });
};

const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    error: { message: `Route ${req.method} ${req.path} not found`, code: 'NOT_FOUND' },
  });
};

module.exports = { errorHandler, notFoundHandler };
