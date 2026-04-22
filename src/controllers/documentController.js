'use strict';

const multer = require('multer');
const ragService = require('../services/ragService');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const uploadDocument = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: { message: 'No file uploaded' } });

    let text;
    if (req.file.mimetype === 'application/pdf') {
      text = await ragService.parsePdf(req.file.buffer);
    } else {
      text = req.file.buffer.toString('utf-8');
    }

    if (!text) return res.status(400).json({ success: false, error: { message: 'Could not extract text from file' } });

    const doc = await ragService.ingest(req.user.id, text, 'upload', req.file.originalname);
    res.json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
};

const ingestText = async (req, res, next) => {
  try {
    const { text, source = 'manual' } = req.body;
    if (!text) return res.status(400).json({ success: false, error: { message: 'text required' } });

    const doc = await ragService.ingest(req.user.id, text, source, 'text-input');
    res.json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
};

module.exports = { upload, uploadDocument, ingestText };
