'use strict';

const express = require('express');
const multer = require('multer');
const documentController = require('../controllers/documentController');
const { requireAuth } = require('../middleware/auth');
const validateRequest = require('../middleware/validateRequest');
const { z } = require('zod');

const router = express.Router();
const upload = multer({
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

const querySchema = z.object({
    query: z.string().min(1)
});

router.use(requireAuth);

router.post('/upload', upload.single('file'), documentController.uploadDocument);
router.post('/query', validateRequest(querySchema), documentController.queryDocuments);

module.exports = router;
