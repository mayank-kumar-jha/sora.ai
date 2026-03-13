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

    // 1. One-time tasks that are due
    const oneTimeTasks = await prisma.task.findMany({
        where: {
            type: 'ONE_TIME',
            status: 'PENDING',
            scheduledTime: { lte: now }
        }
    });

    for (const task of oneTimeTasks) {
        await queues.task.add(`task-${task.id}`, { taskId: task.id, userId: task.userId });
        logger.info(`Queued one-time task ${task.id}`);
    }

    // 2. Recurring tasks (Simplified Scan)
    // In a production app, you might use BullMQ's repeatable jobs
    // but here we demonstrate the trigger engine logic.
    const recurringTasks = await prisma.task.findMany({
        where: {
            type: 'RECURRING',
            status: 'PENDING'
        }
    });

    for (const task of recurringTasks) {
        if (!task.recurrenceRule) continue;

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
