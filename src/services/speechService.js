'use strict';

const Groq = require('groq-sdk');
const fs = require('fs');
const AppError = require('../utils/AppError');

let groqClient;

const API_KEY = process.env.GROQ_API_KEY || null;

/**
 * Get Groq client instance
 */
const getClient = () => {
    if (!API_KEY) {
        throw new AppError('GROQ_API_KEY is missing. Please set it in .env for voice transcription.', 500, 'CONFIG_ERROR');
    }

    if (!groqClient) {
        groqClient = new Groq({ apiKey: API_KEY });
    }
    return groqClient;
};

/**
 * Transcribe audio file to text using Groq Whisper
 * @param {string} filePath - Path to the audio file
 * @returns {Promise<string>} - Transcription text
 */
const transcribeAudio = async (filePath) => {
    const client = getClient();

    try {
        const transcription = await client.audio.transcriptions.create({
            file: fs.createReadStream(filePath),
            model: 'whisper-large-v3',
            language: 'en',
        });

        return transcription.text || '';
    } catch (error) {
        console.error('Groq Whisper Transcription Error:', error);
        throw new AppError(`Speech transcription failed: ${error.message}`, 500, 'SPEECH_ERROR');
    }
};

module.exports = {
    transcribeAudio,
};
