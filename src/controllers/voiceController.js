'use strict';

const speechService = require('../services/speechService');
const { sendSuccess } = require('../utils/response');
const { asyncHandler } = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const fs = require('fs');
const path = require('path');

/**
 * POST /api/voice/transcribe
 */
const transcribe = asyncHandler(async (req, res) => {
    if (!req.file) {
        throw new AppError('Audio file is required.', 400, 'VALIDATION_ERROR');
    }

    const { path: filePath } = req.file;

    try {
        const transcript = await speechService.transcribeAudio(filePath);

        // Clean up temporary file - use a slight delay on Windows if EBUSY occurs
        try {
            fs.unlinkSync(filePath);
        } catch (unlinkError) {
            if (unlinkError.code === 'EBUSY') {
                setTimeout(() => {
                    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) { }
                }, 1000);
            }
        }

        sendSuccess(res, {
            message: 'Transcription successful.',
            data: { text: transcript }
        });
    } catch (error) {
        // Ensure cleanup even on error
        try {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (e) {
            if (e.code === 'EBUSY') {
                setTimeout(() => {
                    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (err) { }
                }, 1000);
            }
        }
        throw error;
    }
});

module.exports = {
    transcribe
};
