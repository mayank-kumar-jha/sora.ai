'use strict';

const { PrismaClient } = require('@prisma/client');
const logger = require('./logger');

const prisma = new PrismaClient({
    log: [
        { level: 'query', emit: 'event' },
        { level: 'warn', emit: 'event' },
        { level: 'error', emit: 'event' },
    ],
    // Explicitly handle connection pool limits
    // Note: Render's free/starter tier often has a low connection limit (9-10)
    // We adjust the client to be more conservative.
    datasources: {
        db: {
            url: `${process.env.DATABASE_URL}${process.env.DATABASE_URL.includes('?') ? '&' : '?'}connection_limit=5&pool_timeout=20`,
        },
    },
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
