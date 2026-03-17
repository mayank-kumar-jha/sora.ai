'use strict';

const { Worker } = require('bullmq');
const { connection } = require('../queues');
const logger = require('../config/logger');

// Services
const agentService = require('../services/agentService');
const embeddingService = require('../services/embeddingService');
const vectorDbService = require('../services/vectorDbService');
const { triggerReminder } = require('../services/reminderService');
const { executeAutomation } = require('../services/automationService');
const { notifyUser } = require('../services/websocketService');
const prisma = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const mainWorker = new Worker('mainQueue', async (job) => {
    const { name: type, data } = job;
    logger.info(`Processing job ${job.id} of type ${type}`);

    try {
        switch (type) {
            case 'aiQueue': // Support legacy names
            case 'AI_PROCESS':
                const { userId, message, context } = data;
                return await agentService.processMessage(userId, message, context);

            case 'embeddingQueue':
            case 'GENERATE_EMBEDDING': {
                const { userId: uid, text, source } = data;
                const vectorId = uuidv4();
                const embedding = await embeddingService.generateEmbedding(text);
                
                if (!embedding || !Array.isArray(embedding)) {
                    logger.warn(`Embedding skipped for job ${job.id}`);
                    return;
                }

                await vectorDbService.upsertVector(vectorId, embedding, {
                    userId: uid,
                    text,
                    timestamp: new Date().toISOString(),
                    source
                });

                await prisma.embeddingMetadata.create({
                    data: { userId: uid, vectorId, source }
                });
                break;
            }

            case 'taskQueue':
            case 'EXECUTE_TASK': {
                const { taskId, userId: taskUid } = data;
                const task = await prisma.task.findUnique({ where: { id: taskId } });
                if (!task) throw new Error('Task not found');

                if (task.title.startsWith('ALARM:')) {
                    notifyUser(taskUid, 'TRIGGER_ALARM', { label: task.title.replace('ALARM: ', '') });
                    await prisma.task.update({ 
                        where: { id: taskId }, 
                        data: { status: 'COMPLETED', updatedAt: new Date() } 
                    });
                } else if (task.title === 'SEND_WHATSAPP' && task.description) {
                    const payload = JSON.parse(task.description);
                    await executeAutomation(taskUid, taskId, 'SEND_WHATSAPP', payload);
                } else {
                    await executeAutomation(taskUid, taskId, 'CREATE_TASK', { details: task.title });
                }
                break;
            }

            case 'reminderQueue':
            case 'TRIGGER_REMINDER': {
                const { reminderId } = data;
                await triggerReminder(reminderId);
                break;
            }

            default:
                logger.warn(`Unknown job type: ${type}`);
        }
    } catch (error) {
        logger.error(`Job ${job.id} (${type}) failed`, { error: error.message });
        throw error;
    }
}, { 
    connection,
    // Bulletproof settings for Upstash/Render
    lockDuration: 60000,          // 1 minute lock
    stalledInterval: 60000,       // Check for stalled tasks once a minute
    drainDelay: 5000,             // Polling delay (5s) when queue is empty to save Upstash requests
});

mainWorker.on('failed', (job, err) => {
    logger.error(`Job ${job.id} failed permanently`, { error: err.message });
});

// Prevent unhandled rejections from worker errors (e.g. Redis connection drops)
mainWorker.on('error', (err) => {
    if (err.message.includes('max requests limit exceeded')) {
        logger.warn('MainWorker: Redis limit hit, pausing worker...');
        mainWorker.pause().catch(() => {});
    } else {
        logger.error('MainWorker: Unexpected error', { error: err.message });
    }
});

module.exports = mainWorker;
