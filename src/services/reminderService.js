'use strict';

const prisma = require('../config/database');
const logger = require('../config/logger');
// const { emitToUser } = require('./websocketService'); // To be refactored

/**
 * Execute a reminder
 */
const triggerReminder = async (reminderId) => {
    const reminder = await prisma.reminder.findUnique({
        where: { id: reminderId },
        include: { user: true }
    });

    if (!reminder || reminder.sent) return;

    logger.info(`Triggering reminder ${reminderId} for user ${reminder.userId}`);

    try {
        // 1. Mark as sent
        await prisma.reminder.update({
            where: { id: reminderId },
            data: { sent: true }
        });

        // 2. Emit WebSocket event (Phase 8)
        // This will be handled by the real-time system once refactored
        // For now, we log it
        logger.info(`Reminder Message: ${reminder.message}`);

        return { success: true, message: reminder.message };
    } catch (error) {
        logger.error(`Failed to trigger reminder ${reminderId}`, { error: error.message });
        throw error;
    }
};

module.exports = {
    triggerReminder
};
