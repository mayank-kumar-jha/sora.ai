'use strict';

const googleService = require('./googleService');
const prisma = require('../config/database');
const logger = require('../config/logger');
const AppError = require('../utils/AppError');

/**
 * Trigger an automation based on task type or specific instructions
 */
const executeAutomation = async (userId, taskId, action, payload) => {
    let result;
    let status = 'COMPLETED';
    let error = null;

    logger.info(`Executing automation for task ${taskId}`, { action, userId });

    try {
        switch (action) {
            case 'CREATE_CALENDAR_EVENT':
                result = await googleService.createCalendarEvent(userId, payload);
                break;
            case 'SEND_EMAIL':
                result = await googleService.sendEmail(userId, payload);
                break;
            case 'UPLOAD_DRIVE_FILE':
                result = await googleService.uploadDriveFile(userId, payload);
                break;
            case 'SEND_WHATSAPP':
                const whatsappService = require('./whatsappService');
                await whatsappService.waitUntilReady();
                result = await whatsappService.sendWhatsAppMessage(payload.to, payload.message);
                break;
            case 'CREATE_TASK':
                // Sub-task creation or internal task logic
                result = { message: 'Internal task executed' };
                break;
            default:
                throw new AppError(`Unknown action: ${action}`, 400, 'INVALID_ACTION');
        }
    } catch (err) {
        logger.error(`Automation failed for task ${taskId}`, { error: err.message });
        status = 'FAILED';
        error = err.message;
        throw err;
    } finally {
        // Record execution log
        await prisma.executionLog.create({
            data: {
                taskId,
                userId,
                status,
                output: result ? JSON.stringify(result) : null,
                error
            }
        });

        // Update task lastRunAt if recurring
        await prisma.task.update({
            where: { id: taskId },
            data: { lastRunAt: new Date(), status }
        });
    }

    return result;
};

module.exports = {
    executeAutomation
};
