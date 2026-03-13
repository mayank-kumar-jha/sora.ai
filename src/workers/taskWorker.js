'use strict';

const { Worker } = require('bullmq');
const { connection } = require('../queues');
const { executeAutomation } = require('../services/automationService');
const prisma = require('../config/database');
const logger = require('../config/logger');

const taskWorker = new Worker('taskQueue', async (job) => {
    const { taskId, userId } = job.data;
    logger.info(`Processing task job ${job.id} for task ${taskId}`);

    try {
        const task = await prisma.task.findUnique({ where: { id: taskId } });
        if (!task) throw new Error('Task not found');

        if (task.title.startsWith('ALARM:')) {
            const { notifyUser } = require('../services/websocketService');
            // Notify user of the alarm via WebSocket
            notifyUser(userId, 'TRIGGER_ALARM', { label: task.title.replace('ALARM: ', '') });
            
            // Mark task as completed to avoid re-triggering
            await prisma.task.update({ where: { id: taskId }, data: { status: 'COMPLETED', updatedAt: new Date() } });
            logger.info(`Alarm ${taskId} triggered and notified user ${userId}`);
            return;
        }

        // Logic to determine action and payload from task description or metadata
        const action = task.type === 'RECURRING' ? 'SEND_WEEKLY_REPORT' : 'GENERIC_AUTOMATION';
        await executeAutomation(userId, taskId, 'CREATE_TASK', { details: task.title });

        logger.info(`Task ${taskId} executed successfully`);
    } catch (error) {
        logger.error(`Task ${taskId} failed`, { error: error.message });
        throw error;
    }
}, { connection });

taskWorker.on('failed', (job, err) => {
    logger.error(`Job ${job.id} failed`, { error: err.message });
});

module.exports = taskWorker;
