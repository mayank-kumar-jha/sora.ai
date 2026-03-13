'use strict';

const { google } = require('googleapis');
const googleTokenService = require('./googleTokenService');
const googleConfig = require('../config/google');
const AppError = require('../utils/AppError');

/**
 * Get authenticated Google API client
 */
const getClient = async (userId, serviceName, version) => {
    const accessToken = await googleTokenService.getValidAccessToken(userId);

    const auth = new google.auth.OAuth2(
        googleConfig.clientId,
        googleConfig.clientSecret,
        googleConfig.redirectUri
    );

    auth.setCredentials({ access_token: accessToken });

    return google[serviceName]({ version, auth });
};

/**
 * Google Calendar: Create Event
 */
const createCalendarEvent = async (userId, eventData) => {
    const calendar = await getClient(userId, 'calendar', 'v3');
    try {
        const { data } = await calendar.events.insert({
            calendarId: 'primary',
            resource: eventData
        });
        return data;
    } catch (error) {
        throw new AppError(`Google Calendar Error: ${error.message}`, 500, 'GOOGLE_API_ERROR');
    }
};

/**
 * Google Calendar: List Events
 */
const listCalendarEvents = async (userId, maxResults = 10) => {
    const calendar = await getClient(userId, 'calendar', 'v3');
    try {
        const { data } = await calendar.events.list({
            calendarId: 'primary',
            timeMin: new Date().toISOString(),
            maxResults,
            singleEvents: true,
            orderBy: 'startTime',
        });
        return data.items;
    } catch (error) {
        throw new AppError(`Google Calendar Error: ${error.message}`, 500, 'GOOGLE_API_ERROR');
    }
};

/**
 * Gmail: Send Email
 */
const sendEmail = async (userId, { to, subject, body }) => {
    const gmail = await getClient(userId, 'gmail', 'v1');

    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
    const messageParts = [
        `To: ${to}`,
        'Content-Type: text/html; charset=utf-8',
        'MIME-Version: 1.0',
        `Subject: ${utf8Subject}`,
        '',
        body,
    ];
    const message = messageParts.join('\n');
    const encodedMessage = Buffer.from(message)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

    try {
        const { data } = await gmail.users.messages.send({
            userId: 'me',
            resource: { raw: encodedMessage },
        });
        return data;
    } catch (error) {
        throw new AppError(`Gmail Error: ${error.message}`, 500, 'GOOGLE_API_ERROR');
    }
};

/**
 * Gmail: Read Emails
 */
const readEmails = async (userId, maxResults = 5) => {
    const gmail = await getClient(userId, 'gmail', 'v1');
    try {
        const { data } = await gmail.users.messages.list({
            userId: 'me',
            maxResults
        });

        if (!data.messages) return [];

        const messages = await Promise.all(
            data.messages.map(async (msg) => {
                const { data: detail } = await gmail.users.messages.get({
                    userId: 'me',
                    id: msg.id
                });
                return detail;
            })
        );
        return messages;
    } catch (error) {
        throw new AppError(`Gmail Error: ${error.message}`, 500, 'GOOGLE_API_ERROR');
    }
};

/**
 * Google Drive: List Files
 */
const listDriveFiles = async (userId, pageSize = 10) => {
    const drive = await getClient(userId, 'drive', 'v3');
    try {
        const { data } = await drive.files.list({
            pageSize,
            fields: 'nextPageToken, files(id, name, mimeType)',
        });
        return data.files;
    } catch (error) {
        throw new AppError(`Google Drive Error: ${error.message}`, 500, 'GOOGLE_API_ERROR');
    }
};

/**
 * Google Drive: Upload File
 */
const uploadDriveFile = async (userId, { name, mimeType, body }) => {
    const drive = await getClient(userId, 'drive', 'v3');
    try {
        const { data } = await drive.files.create({
            resource: { name, mimeType },
            media: {
                mimeType,
                body
            },
            fields: 'id, name'
        });
        return data;
    } catch (error) {
        throw new AppError(`Google Drive Error: ${error.message}`, 500, 'GOOGLE_API_ERROR');
    }
};

module.exports = {
    createCalendarEvent,
    listCalendarEvents,
    sendEmail,
    readEmails,
    listDriveFiles,
    uploadDriveFile
};
