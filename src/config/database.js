'use strict';

const { PrismaClient } = require('@prisma/client');
const logger = require('./logger');

let databaseUrl = process.env.DATABASE_URL;

// On Render/Supabase, the pooler is very sensitive. We force a small limit.
// We remove any existing connection_limit/pgbouncer and set our own optimized values.
if (databaseUrl) {
    databaseUrl = databaseUrl.replace(/[?&]connection_limit=\d+/, '');
    databaseUrl = databaseUrl.replace(/[?&]pool_timeout=\d+/, '');
    const separator = databaseUrl.includes('?') ? '&' : '?';
    databaseUrl += `${separator}connection_limit=2&pool_timeout=60`;
    logger.info('[Prisma] Optimized connection settings for Supabase Pooler (limit=2)');
}

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: databaseUrl
        }
    },
    log: [
        { level: 'query', emit: 'event' },
        { level: 'warn', emit: 'event' },
        { level: 'error', emit: 'event' },
    ],
});

// Log slow queries in development
if (process.env.NODE_ENV !== 'production') {
    prisma.$on('query', (e) => {
        if (e.duration > 200) {
            logger.warn('Slow Prisma query', {
                query: e.query,
                duration: `${e.duration}ms`,
                params: e.params,
            });
        }
    });
}

prisma.$on('warn', (e) => logger.warn('Prisma warning', { message: e.message }));
prisma.$on('error', (e) => logger.error('Prisma error', { message: e.message }));

module.exports = prisma;
