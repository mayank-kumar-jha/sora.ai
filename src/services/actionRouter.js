'use strict';

const googleController = require('../controllers/googleController'); // Using controllers as tool providers
const googleService = require('./googleService');
const prisma = require('../config/database');
const AppError = require('../utils/AppError');
const whatsappService = require('./whatsappService');

/**
 * Parse a date/time string into a valid Date object.
 * Expects an ISO 8601 string from the AI.
 */
const parseDateTime = (input) => {
    if (!input) return null;

    const parsedDate = new Date(input);
    if (!isNaN(parsedDate.getTime())) {
        return parsedDate;
    }

    console.error(`Invalid date format provided for alarm: "${input}"`);
    throw new AppError(`Could not parse the provided time: ${input}. Requires ISO 8601 formatting.`, 400, 'INVALID_DATE');
};

/**
 * Route structured AI actions to the appropriate services
 */
const routeAction = async (userId, action, payload = {}) => {
    payload = payload || {};
    switch (action) {
        case 'CREATE_CALENDAR_EVENT':
            return await googleService.createCalendarEvent(userId, {
                summary: payload.summary,
                description: payload.description,
                start: { dateTime: payload.start, timeZone: 'UTC' },
                end: { dateTime: payload.end, timeZone: 'UTC' }
            });

        case 'LIST_CALENDAR_EVENTS':
            return await googleService.listCalendarEvents(userId, payload.maxResults);

        case 'SEND_EMAIL':
            return await googleService.sendEmail(userId, {
                to: payload.to,
                subject: payload.subject,
                body: payload.body
            });

        case 'GET_INBOX':
            return await googleService.readEmails(userId, payload.maxResults);

        case 'UPLOAD_DRIVE_FILE':
            return await googleService.uploadDriveFile(userId, {
                name: payload.name,
                mimeType: payload.mimeType,
                body: payload.content
            });

        case 'GET_WHATSAPP_MESSAGES':
            return await whatsappService.getRecentChats(payload.limit || 10);
        case 'GET_WHATSAPP_CONTACTS':
            return await whatsappService.getContacts(payload.limit || 20);
        case 'CLEAR_WHATSAPP_CACHE':
            return await whatsappService.clearCache();
        case 'SEND_WHATSAPP':
            return await whatsappService.sendWhatsAppMessage(payload.to, payload.message);
        case 'SCHEDULE_WHATSAPP':
            return await prisma.task.create({
                data: {
                    userId,
                    title: 'SEND_WHATSAPP',
                    description: JSON.stringify({ to: payload.to, message: payload.message }),
                    type: 'ONE_TIME',
                    status: 'PENDING',
                    scheduledTime: parseDateTime(payload.time)
                }
            });

        case 'LIST_DRIVE_FILES':
            return await googleService.listDriveFiles(userId, payload.pageSize);

        case 'WEB_SEARCH':
            const webSearchService = require('./webSearchService');
            return await webSearchService.performWebSearch(payload.query);

        case 'CREATE_TASK':
            return await prisma.task.create({
                data: {
                    userId,
                    title: payload.title,
                    scheduledTime: parseDateTime(payload.scheduledTime)
                }
            });

        case 'CREATE_REMINDER':
            return await prisma.reminder.create({
                data: {
                    userId,
                    message: payload.message,
                    reminderTime: parseDateTime(payload.reminderTime)
                }
            });

        case 'MAKE_CALL':
            // This is handled client-side on the phone
            return {
                clientAction: 'MAKE_CALL',
                contactName: payload.contactName,
                message: `Calling ${payload.contactName}...`
            };


        case 'OPEN_APP':
            return {
                clientAction: 'OPEN_APP',
                appName: payload.appName,
                message: `Opening ${payload.appName}...`
            };

        case 'OPEN_URL':
            return {
                clientAction: 'OPEN_URL',
                url: payload.url,
                message: `Opening ${payload.url}...`
            };

        case 'PLAY_MUSIC':
            return {
                clientAction: 'PLAY_MUSIC',
                songName: payload.songName,
                message: `Playing ${payload.songName}...`
            };

        case 'SET_ALARM':
            const alarmTime = parseDateTime(payload.time);
            // Persist alarm as a high-priority task for background execution
            await prisma.task.create({
                data: {
                    userId,
                    title: `ALARM: ${payload.label || 'Sora Alarm'}`,
                    type: 'ONE_TIME',
                    status: 'PENDING',
                    scheduledTime: alarmTime
                }
            });
            return {
                clientAction: 'SET_ALARM',
                time: alarmTime.toISOString(),
                label: payload.label || 'Sora Alarm',
                message: `Alarm set for ${alarmTime.toLocaleTimeString()}.`
            };

        default:
            throw new AppError(`Unsupported action: ${action}`, 400, 'INVALID_ACTION');
    }
};

module.exports = {
    routeAction,
};
