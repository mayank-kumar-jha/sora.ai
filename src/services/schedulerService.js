'use strict';

const prisma = require('../config/database');
const { queues } = require('../queues');
const logger = require('../config/logger');
const cronParser = require('cron-parser');

/**
 * Scan database for pending tasks and add them to the queue
 */
const schedulePendingTasks = async () => {
    const now = new Date();

    // Fetch both pending one-time tasks and active recurring tasks in one batch
    const pendingTasks = await prisma.task.findMany({
        where: {
            status: 'PENDING',
            OR: [
                { type: 'ONE_TIME', scheduledTime: { lte: now } },
                { type: 'RECURRING' }
            ]
        },
        select: { id: true, userId: true, type: true, recurrenceRule: true, lastRunAt: true, createdAt: true }
    });

    for (const task of pendingTasks) {
        if (task.type === 'ONE_TIME') {
            await queues.task.add(`task-${task.id}`, { taskId: task.id, userId: task.userId });
            logger.info(`Queued one-time task ${task.id}`);
        } else if (task.type === 'RECURRING' && task.recurrenceRule) {
            try {
                const interval = cronParser.parseExpression(task.recurrenceRule, {
                    currentDate: task.lastRunAt || task.createdAt
                });
                const nextRun = interval.next().toDate();

                if (nextRun <= now) {
                    await queues.task.add(`task-${task.id}`, { taskId: task.id, userId: task.userId });
                    logger.info(`Queued recurring task ${task.id}`);
                }
            } catch (err) {
                logger.error(`Invalid cron pattern for task ${task.id}`, { error: err.message });
            }
        }
    }
};

/**
 * Scan for due reminders
 */
const schedulePendingReminders = async () => {
    const now = new Date();
    const reminders = await prisma.reminder.findMany({
        where: {
            sent: false,
            reminderTime: { lte: now }
        }
    });

    for (const reminder of reminders) {
        await queues.reminder.add(`reminder-${reminder.id}`, { reminderId: reminder.id });
        logger.info(`Queued reminder ${reminder.id}`);
    }
};

module.exports = {
    schedulePendingTasks,
    schedulePendingReminders
};
