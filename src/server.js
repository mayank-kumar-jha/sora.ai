'use strict';
// Redeploying to fix Deepgram Voice ID mapping mismatch (Eight legacy IDs mapped to Aura)

// Must be first – validates & loads all env vars before anything else
const config = require('./config/env');
const logger = require('./config/logger');

// Capture early crashes
process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Promise Rejection', { reason });
    if (config.isProduction) process.exit(1);
});

process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
    process.exit(1);
});

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { requestLogger } = require('./middleware/requestLogger');
const { globalRateLimiter } = require('./middleware/rateLimiter');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const routes = require('./routes');
const prisma = require('./config/database');
const { getRedisClient, disconnectRedis } = require('./config/redis');
const { initAiWebSocket } = require('./services/websocketService');
const { handleWebhook } = require('./controllers/webhookController');
const bullBoardAdapter = require('./config/bullBoard');
const { schedulePendingTasks, schedulePendingReminders } = require('./services/schedulerService');
const cron = require('node-cron');

// Start Workers
require('./workers');

const app = express();

// ─── Security Middleware ────────────────────────────────────────────────────
app.use(helmet());

app.use(
    cors({
        origin: config.isProduction
            ? process.env.ALLOWED_ORIGINS?.split(',') ?? []
            : '*',
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    })
);

// ─── Webhooks (Must be before body parsers for raw body) ───────────────────
app.post('/api/webhook', express.raw({ type: 'application/json' }), handleWebhook);

// ─── Body Parsing ───────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Trust Proxy (for accurate IPs behind reverse proxy) ───────────────────
app.set('trust proxy', 1);

// ─── Request Logging ────────────────────────────────────────────────────────
app.use(requestLogger);

// ─── Health check (Moved above rate limiter to prevent Render 429s) ────────
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), message: 'Sora Backend is reachable (v1.1.0-deploy-fix)' });
});

// ─── Global Rate Limiting ───────────────────────────────────────────────────
app.use(globalRateLimiter);

// ─── Routes ──────────────────────────────────────────────────────────────────
// Bull Board Dashboard
app.use('/admin/queues', bullBoardAdapter.getRouter());

app.use('/api', routes);

// ─── 404 Handler ────────────────────────────────────────────────────────────
app.use(notFoundHandler);

// ─── Global Error Handler ───────────────────────────────────────────────────
app.use(errorHandler);

// ─── Server Bootstrap ───────────────────────────────────────────────────────
const startServer = async () => {
    // Pre-flight: DB connection
    prisma.$connect()
        .then(() => logger.info('Database: Connected successfully'))
        .catch((err) => {
            logger.error('DATABASE CONNECTION FAILED - Server may be unstable', { error: err.message });
        });

    // Pre-flight: Redis is optional and protected by circuit breaker
    const { getRedisSuspended } = require('./config/redis');
    if (getRedisSuspended()) {
        logger.warn('Redis: CIRCUIT BREAKER ACTIVE - Skipping connection check');
    } else {
        const redis = getRedisClient();
        if (redis) {
            redis.ping()
                .then(() => logger.info('Redis: Connected successfully'))
                .catch((err) => {
                    logger.warn('Redis: Unavailable at startup - proceeding with database only', { error: err.message });
                });
        }
    }

    const server = app.listen(config.port, '0.0.0.0', () => {
        logger.info(`Server started`, {
            host: '0.0.0.0',
            port: config.port,
            environment: config.nodeEnv,
            redis_set: !!process.env.REDIS_URL,
            redis_len: (process.env.REDIS_URL || '').length,
            pid: process.pid,
        });
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            logger.error(`Port ${config.port} is already in use. Exiting so nodemon can retry...`);
            process.exit(1);
        } else {
            throw err;
        }
    });

    // Initialize AI WebSocket
    initAiWebSocket(server);

    // Initialize WhatsApp
    const { initWhatsApp } = require('./services/whatsappService');
    initWhatsApp().catch(err => {
        logger.error('WhatsApp Initialization Failed', { error: err.message });
    });

    // Initial Scheduler Scan - Non-blocking to prevent startup timeouts
    setImmediate(async () => {
        try {
            logger.info('Performing initial scheduler scan...');
            await schedulePendingTasks();
            await schedulePendingReminders();
        } catch (err) {
            logger.warn('Initial scheduler scan failed', { error: err.message });
        }
    });

    // Setup Cron for Scheduler (every 1 minute)
    cron.schedule('* * * * *', async () => {
        try {
            logger.info('Running scheduled task scan...');
            await schedulePendingTasks();
            await schedulePendingReminders();
        } catch (err) {
            logger.error('Scheduled task scan failed', { error: err.message });
        }
    });

    // ─── Graceful Shutdown ────────────────────────────────────────────────────
    const shutdown = async (signal) => {
        logger.info(`${signal} received. Starting graceful shutdown...`);

        server.close(async () => {
            logger.info('HTTP server closed');

            await prisma.$disconnect();
            logger.info('Database: Disconnected');

            await disconnectRedis();
            logger.info('Redis: Disconnected');

            logger.info('Graceful shutdown complete');
            process.exit(0);
        });

        // Force exit if shutdown takes too long
        setTimeout(() => {
            logger.error('Graceful shutdown timed out. Forcing exit.');
            process.exit(1);
        }, 15_000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
};

startServer().catch((err) => {
    logger.error('Failed to start server', { error: err.message });
    process.exit(1);
});

module.exports = app; // Export for testing
