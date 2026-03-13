'use strict';

const fileService = require('../services/fileService');
const documentProcessor = require('../services/documentProcessor');
const agentService = require('../services/agentService');
const AppError = require('../utils/AppError');
const { v4: uuidv4 } = require('uuid');

/**
 * Handle document upload and processing
 */
const uploadDocument = async (req, res, next) => {
    try {
        if (!req.file) {
            throw new AppError('No file uploaded', 400);
        }

        const userId = req.user.id;
        const fileId = uuidv4();
        const key = `documents/${userId}/${fileId}-${req.file.originalname}`;

        // 1. Upload to S3
        await fileService.uploadFile(key, req.file.buffer, req.file.mimetype);

        // 2. Extract text and queue for embedding
        await documentProcessor.processDocument(userId, fileId, req.file.buffer, req.file.mimetype);

        res.status(201).json({
            status: 'success',
            data: {
                id: fileId,
                name: req.file.originalname,
                key
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Query documents using AI with RAG
 */
const queryDocuments = async (req, res, next) => {
    try {
        const { query } = req.body;
        const userId = req.user.id;

        // Use the existing agentService which now supports RAG
        // It will automatically pull relevant document context if embeddings were successful
        const response = await agentService.processMessage(userId, `CONTEXT_DOCUMENT_QUERY: ${query}`);

        res.status(200).json({
            status: 'success',
            data: {
                answer: response.message || response.result
            }
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    uploadDocument,
    queryDocuments
};
