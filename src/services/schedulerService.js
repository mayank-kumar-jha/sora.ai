'use strict';

const prisma = require('../config/database');
const { addJob } = require('../queues');
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
            await addJob('EXECUTE_TASK', { taskId: task.id, userId: task.userId }, { jobId: `task-${task.id}` });
        } else if (task.type === 'RECURRING' && task.recurrenceRule) {
            try {
                const interval = cronParser.parseExpression(task.recurrenceRule, {
                    currentDate: task.lastRunAt || task.createdAt
                });
                const nextRun = interval.next().toDate();

                if (nextRun <= now) {
                    await addJob('EXECUTE_TASK', { taskId: task.id, userId: task.userId }, { jobId: `task-${task.id}-${Date.now()}` });
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
        await addJob('TRIGGER_REMINDER', { reminderId: reminder.id }, { jobId: `reminder-${reminder.id}` });
    }
};

module.exports = {
    schedulePendingTasks,
    schedulePendingReminders
};
