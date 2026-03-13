'use strict';

const { createLogger, format, transports } = require('winston');
require('winston-daily-rotate-file');
const { nodeEnv, isProduction } = require('./env');

const { combine, timestamp, printf, colorize, errors, json } = format;

// Human-readable format for development
const devFormat = combine(
    colorize({ all: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    printf(({ timestamp, level, message, stack, ...meta }) => {
        const metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
        return `[${timestamp}] ${level}: ${stack || message}${metaStr}`;
    })
);

// Structured JSON format for production
const prodFormat = combine(
    timestamp(),
    errors({ stack: true }),
    json()
);

const fileRotateTransport = new transports.DailyRotateFile({
    filename: 'logs/app-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    maxFiles: '14d',
    maxSize: '20m',
    level: 'debug',
    format: combine(timestamp(), errors({ stack: true }), json()),
});

const errorRotateTransport = new transports.DailyRotateFile({
    filename: 'logs/error-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    maxFiles: '30d',
    maxSize: '20m',
    level: 'error',
    format: combine(timestamp(), errors({ stack: true }), json()),
});

const logger = createLogger({
    level: isProduction ? 'info' : 'debug',
    format: isProduction ? prodFormat : devFormat,
    transports: [
        new transports.Console(),
        fileRotateTransport,
        errorRotateTransport,
    ],
    exitOnError: false,
});

// Stream interface for Morgan-style HTTP logging if needed in future
logger.stream = {
    write: (message) => logger.http(message.trim()),
};

module.exports = logger;
