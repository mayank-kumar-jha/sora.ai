'use strict';

const { PrismaClient } = require('@prisma/client');
const logger = require('./logger');

let databaseUrl = process.env.DATABASE_URL;

// On Render/Supabase, the pooler often needs a specific connection limit in the URL.
// If missing, we append a safe default (20) to prevent the "Timed out fetching a new connection" error.
if (databaseUrl && databaseUrl.includes('pooler') && !databaseUrl.includes('connection_limit')) {
    const separator = databaseUrl.includes('?') ? '&' : '?';
    databaseUrl += `${separator}connection_limit=20`;
    logger.info('[Prisma] Appended connection_limit=20 to DATABASE_URL');
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
