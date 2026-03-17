'use strict';

const { Router } = require('express');
const { sendSuccess } = require('../utils/response');
const prisma = require('../config/database');
const { getRedisClient } = require('../config/redis');

const router = Router();

/**
 * GET /api/health
 * Returns service health including DB and Redis connectivity.
 */
router.get('/', async (req, res) => {
    const health = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: `${Math.floor(process.uptime())}s`,
        environment: process.env.NODE_ENV,
        services: {
            database: 'unknown',
            redis: 'unknown',
        },
    };

    // Check DB
    try {
        await prisma.$queryRaw`SELECT 1`;
        health.services.database = 'connected';
    } catch {
        health.services.database = 'disconnected';
        health.status = 'degraded';
    }

    // Check WhatsApp
    try {
        const whatsapp = require('../services/whatsappService');
        health.services.whatsapp = whatsapp.getStatus().status;
    } catch {
        health.services.whatsapp = 'unknown';
    }

    const statusCode = health.status === 'ok' ? 200 : 503;
    return res.status(statusCode).json({ success: true, ...health });
});

module.exports = router;
