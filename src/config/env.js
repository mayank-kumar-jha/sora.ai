'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const requiredEnvVars = [
    'PORT',
    'DATABASE_URL',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'REDIS_URL',
    'NODE_ENV',
];

for (const key of requiredEnvVars) {
    if (!process.env[key]) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
}

if (process.env.NODE_ENV === 'production') {
    const url = process.env.REDIS_URL || '';
    console.log(`[DEBUG] Redis Config: URL length=${url.length}, Protocol=${url.startsWith('rediss://') ? 'rediss' : 'redis'}`);
}

// Optional warns for Phase 3-12 keys in development
const phase3Vars = [
    'GEMINI_API_KEY',
    'VECTOR_DB_API_KEY',
    'VECTOR_DB_INDEX',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_BUCKET',
    'GOOGLE_ENCRYPTION_KEY',
    'STRIPE_SECRET_KEY',
    'DEEPGRAM_API_KEY'
];
if (process.env.NODE_ENV !== 'production') {
    for (const key of phase3Vars) {
        if (!process.env[key]) {
            console.warn(`[dev-warning] Missing environment variable: ${key}. Some Phase 3-5 features will fail.`);
        }
    }
}

module.exports = {
    port: parseInt(process.env.PORT, 10) || 3000,
    nodeEnv: process.env.NODE_ENV,
    isProduction: process.env.NODE_ENV === 'production',

    db: {
        url: process.env.DATABASE_URL,
    },

    jwt: {
        secret: process.env.JWT_SECRET,
        refreshSecret: process.env.JWT_REFRESH_SECRET,
        expiresIn: process.env.JWT_EXPIRES_IN || '30d',
        refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '90d',
    },

    redis: {
        url: process.env.REDIS_URL,
    },

    bcrypt: {
        saltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 12,
    },

    gemini: {
        apiKey: process.env.GEMINI_API_KEY,
        model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    },

    vectorDb: {
        apiKey: process.env.VECTOR_DB_API_KEY,
        index: process.env.VECTOR_DB_INDEX,
    },

    aws: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: process.env.AWS_REGION || 'us-east-1',
        bucket: process.env.AWS_BUCKET
    },

    google: {
        encryptionKey: process.env.GOOGLE_ENCRYPTION_KEY
    },

    stripe: {
        secretKey: process.env.STRIPE_SECRET_KEY,
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET
    },

    deepgram: {
        apiKey: process.env.DEEPGRAM_API_KEY
    }
};
