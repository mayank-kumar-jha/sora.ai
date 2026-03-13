'use strict';

const googleService = require('../services/googleService');
const { sendSuccess } = require('../utils/response');
const { asyncHandler } = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');

/**
 * POST /api/google/calendar/create
 */
const createCalendarEvent = asyncHandler(async (req, res) => {
    const { summary, description, start, end } = req.body;

    if (!summary || !start || !end) {
        throw new AppError('summary, start, and end are required.', 400, 'VALIDATION_ERROR');
    }

    const eventData = {
        summary,
        description,
        start: { dateTime: start, timeZone: 'UTC' },
        end: { dateTime: end, timeZone: 'UTC' }
    };

    const event = await googleService.createCalendarEvent(req.user.id, eventData);
    sendSuccess(res, { message: 'Calendar event created.', data: event });
});

/**
 * GET /api/google/calendar/events
 */
const listCalendarEvents = asyncHandler(async (req, res) => {
    const { maxResults } = req.query;
    const events = await googleService.listCalendarEvents(req.user.id, parseInt(maxResults) || 10);
    sendSuccess(res, { data: events });
});

/**
 * POST /api/google/gmail/send
 */
const sendEmail = asyncHandler(async (req, res) => {
    const { to, subject, body } = req.body;

    if (!to || !subject || !body) {
        throw new AppError('to, subject, and body are required.', 400, 'VALIDATION_ERROR');
    }

    const result = await googleService.sendEmail(req.user.id, { to, subject, body });
    sendSuccess(res, { message: 'Email sent successfully.', data: result });
});

/**
 * GET /api/google/gmail/inbox
 */
const getInbox = asyncHandler(async (req, res) => {
    const { maxResults } = req.query;
    const emails = await googleService.readEmails(req.user.id, parseInt(maxResults) || 5);
    sendSuccess(res, { data: emails });
});

/**
 * POST /api/google/drive/upload
 */
const uploadFile = asyncHandler(async (req, res) => {
    // Basic implementation for demonstration. 
    // In production, use multipart/form-data with a library like multer.
    const { name, mimeType, content } = req.body;

    if (!name || !mimeType || !content) {
        throw new AppError('name, mimeType, and content are required.', 400, 'VALIDATION_ERROR');
    }

    const result = await googleService.uploadDriveFile(req.user.id, {
        name,
        mimeType,
        body: content
    });

    sendSuccess(res, { message: 'File uploaded to Google Drive.', data: result });
});

/**
 * GET /api/google/drive/files
 */
const listFiles = asyncHandler(async (req, res) => {
    const { pageSize } = req.query;
    const files = await googleService.listDriveFiles(req.user.id, parseInt(pageSize) || 10);
    sendSuccess(res, { data: files });
});

module.exports = {
    createCalendarEvent,
    listCalendarEvents,
    sendEmail,
    getInbox,
    uploadFile,
    listFiles
};
