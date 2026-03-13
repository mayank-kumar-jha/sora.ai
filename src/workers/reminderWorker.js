'use strict';

const { Worker } = require('bullmq');
const { connection } = require('../queues');
const { triggerReminder } = require('../services/reminderService');
const logger = require('../config/logger');

const reminderWorker = new Worker('reminderQueue', async (job) => {
    const { reminderId } = job.data;
    logger.info(`Processing reminder job ${job.id} for reminder ${reminderId}`);

    try {
        await triggerReminder(reminderId);
        logger.info(`Reminder ${reminderId} triggered successfully`);
    } catch (error) {
        logger.error(`Reminder ${reminderId} failed`, { error: error.message });
        throw error;
    }
}, { connection });

reminderWorker.on('failed', (job, err) => {
    logger.error(`Reminder Job ${job.id} failed`, { error: err.message });
});

module.exports = reminderWorker;
