'use strict';

const router = require('express').Router();
const doc = require('../controllers/documentController');
const { authenticate } = require('../middleware/auth');

router.post('/upload', authenticate, doc.upload.single('file'), doc.uploadDocument);
router.post('/ingest', authenticate, doc.ingestText);

module.exports = router;
