'use strict';

const { Worker } = require('bullmq');
const { connection } = require('../queues');
const googleService = require('../services/googleService');
const logger = require('../config/logger');

const emailWorker = new Worker('emailQueue', async (job) => {
    const { userId, to, subject, body } = job.data;
    logger.info(`Processing email job ${job.id} for user ${userId}`);

    try {
        await googleService.sendEmail(userId, { to, subject, body });
        logger.info(`Email sent successfully for user ${userId}`);
    } catch (error) {
        logger.error(`Email job ${job.id} failed`, { error: error.message });
        throw error;
    }
}, { connection });

module.exports = emailWorker;
