'use strict';

const pdfParse = require('pdf-parse');
const { queues } = require('../queues');
const logger = require('../config/logger');
const AppError = require('../utils/AppError');

/**
 * Extract text from different file types
 */
const extractText = async (buffer, mimeType) => {
    try {
        if (mimeType === 'application/pdf') {
            const data = await pdfParse(buffer);
            return data.text;
        } else if (mimeType.startsWith('text/')) {
            return buffer.toString('utf8');
        } else {
            throw new AppError(`Unsupported mime type for text extraction: ${mimeType}`, 400);
        }
    } catch (error) {
        logger.error('Document Extraction Error', { error: error.message, mimeType });
        throw new AppError(`Failed to extract text from document: ${error.message}`, 500, 'EXTRACTION_ERROR');
    }
};

/**
 * Process a document: extract text and queue for embedding
 */
const processDocument = async (userId, fileId, buffer, mimeType) => {
    try {
        const text = await extractText(buffer, mimeType);

        // Queue for embedding generation (RAG)
        await queues.embedding.add(`doc-embed-${fileId}`, {
            userId,
            text,
            source: `document:${fileId}`
        });

        logger.info(`Document ${fileId} queued for processing`);
        return true;
    } catch (error) {
        logger.error('Process Document Error', { error: error.message, fileId });
        throw error;
    }
};

module.exports = {
    extractText,
    processDocument
};
