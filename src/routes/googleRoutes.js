'use strict';

const { Router } = require('express');
const googleController = require('../controllers/googleController');
const { requireAuth } = require('../middleware/auth');

const router = Router();

// All Google routes require user authentication
router.use(requireAuth);

// Calendar
router.post('/calendar/create', googleController.createCalendarEvent);
router.get('/calendar/events', googleController.listCalendarEvents);

// Gmail
router.post('/gmail/send', googleController.sendEmail);
router.get('/gmail/inbox', googleController.getInbox);

// Drive
router.post('/drive/upload', googleController.uploadFile);
router.get('/drive/files', googleController.listFiles);

module.exports = router;
