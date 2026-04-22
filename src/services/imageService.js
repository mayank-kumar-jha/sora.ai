'use strict';

const { HfInference } = require('@huggingface/inference');
const logger = require('../config/logger');

// Initialize Hugging Face Inference client
const hfToken = process.env.HUGGINGFACE_API_KEY;
const hf = (hfToken && hfToken !== 'your_hf_api_token_here') ? new HfInference(hfToken) : null;

/**
 * Generate an image using Hugging Face Inference API
 */
const generateImage = async (prompt) => {
    logger.info(`[ImageGen] Generating image with Hugging Face: "${prompt}"`);

    if (!hf) {
        logger.warn(`[ImageGen] Missing HUGGINGFACE_API_KEY. Using placeholder.`);
        const placeholderUrl = `https://placehold.co/1024x1024/2d3748/ffffff/png?text=Missing+Hugging+Face\\nAPI+Key`;
        return {
            message: `I cannot generate images right now because the Hugging Face API key is missing from the server.`,
            imageUrl: placeholderUrl,
            model: 'placeholder'
        };
    }

    try {
        const modelName = 'black-forest-labs/FLUX.1-schnell';
        const blob = await hf.textToImage({
            model: modelName,
            inputs: prompt,
            parameters: { num_inference_steps: 4 } // Schnell is fast and only needs 4 steps
        });

        // Convert Blob to base64 string
        const arrayBuffer = await blob.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64 = buffer.toString('base64');
        const mimeType = blob.type || 'image/jpeg';

        logger.info(`[ImageGen] Image generated successfully using ${modelName}`);

        return {
            image: base64,
            mimeType: mimeType,
            model: modelName,
        };
    } catch (err) {
        logger.error(`[ImageGen] Hugging Face failed: ${err.message || err}`);
        
        // Fallback placeholder if the model is loading or failed
        const placeholderUrl = `https://placehold.co/1024x1024/2d3748/ffffff/png?text=AI+Image+Generators\\nAre+Currently+Unavailable`;
        return {
            error: `CRITICAL ERROR: The Hugging Face image generator is currently unavailable or returning an error. DO NOT RETRY THIS TOOL. Inform the user that the server is busy.`,
            imageUrl: placeholderUrl,
            model: 'placeholder'
        };
    }
};

/**
 * Edit an image using Hugging Face's Image-to-Image API (timbrooks/instruct-pix2pix)
 */
const editImage = async (imageBase64, prompt) => {
    logger.info(`[ImageGen] Editing image with Hugging Face: "${prompt}"`);

    if (!hf) {
        return {
            message: `I cannot edit images right now because the Hugging Face API key is missing from the server.`,
            imageUrl: `https://placehold.co/1024x1024/2d3748/ffffff/png?text=Missing+Hugging+Face\\nAPI+Key`,
            model: 'placeholder'
        };
    }

    try {
        const modelName = 'timbrooks/instruct-pix2pix';
        
        // Convert base64 back to Blob for Hugging Face SDK
        const cleanBase64 = imageBase64.includes('base64,') ? imageBase64.split('base64,')[1] : imageBase64;
        const buffer = Buffer.from(cleanBase64, 'base64');
        const blob = new Blob([buffer], { type: 'image/jpeg' });

        const resultBlob = await hf.imageToImage({
            model: modelName,
            inputs: blob,
            parameters: { prompt: prompt }
        });

        // Convert Blob to base64 string
        const arrayBuffer = await resultBlob.arrayBuffer();
        const resBuffer = Buffer.from(arrayBuffer);
        const resBase64 = resBuffer.toString('base64');
        const mimeType = resultBlob.type || 'image/jpeg';

        logger.info(`[ImageGen] Image edited successfully using ${modelName}`);

        return {
            image: resBase64,
            mimeType: mimeType,
            model: modelName,
        };
    } catch (err) {
        logger.error(`[ImageGen] Hugging Face edit failed: ${err.message || err}`);
        
        return {
            error: `CRITICAL ERROR: The Hugging Face image editor is returning an error (likely because the model is currently unavailable on their free tier). DO NOT RETRY THIS TOOL. Inform the user that the Image Editor is busy.`,
            imageUrl: `https://placehold.co/1024x1024/2d3748/ffffff/png?text=AI+Image+Editor\\nCurrently+Unavailable`,
            model: 'placeholder'
        };
    }
};

module.exports = { generateImage, editImage };
// Trigger nodemon restart for new .env variables
