'use strict';

const { Router } = require('express');
const multer = require('multer');
const voiceController = require('../controllers/voiceController');
const { requireAuth } = require('../middleware/auth');
const path = require('path');
const AppError = require('../utils/AppError');
const deepgramService = require('../services/deepgramService');

const router = Router();

// Configure Multer for temporary storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['.wav', '.mp3', '.m4a', '.webm', '.mp4', '.ogg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
        cb(null, true);
    } else {
        cb(new AppError('Invalid file type. Only wav, mp3, and m4a are allowed.', 400, 'VALIDATION_ERROR'), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Ensure uploads directory exists
const fs = require('fs');
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

router.use(requireAuth);

router.post('/transcribe', upload.single('audio'), voiceController.transcribe);

// ElevenLabs TTS - Convert text to speech
router.post('/synthesize', async (req, res, next) => {
    try {
        const { text, voiceId } = req.body;
        if (!text || !text.trim()) {
            throw new AppError('Text is required for speech synthesis.', 400, 'VALIDATION_ERROR');
        }
        const audioBuffer = await deepgramService.synthesizeSpeech(text.trim(), voiceId);
        res.set({
            'Content-Type': 'audio/mpeg',
            'Content-Length': audioBuffer.length,
            'Cache-Control': 'no-cache',
        });
        res.send(audioBuffer);
    } catch (err) {
        next(err);
    }
});

module.exports = router;
