'use strict';

const https = require('https');
const AppError = require('../utils/AppError');
const logger = require('../config/logger');
const config = require('../config/env');
const googleTTS = require('google-tts-api');

// Fallback to Google TTS if Deepgram fails or is unconfigured
const getFallbackTTS = async (text) => {
    logger.warn('Using Google TTS API Fallback for voice synthesis.');
    try {
        const chunks = await googleTTS.getAllAudioBase64(text, { lang: 'en', slow: false });
        const buffers = chunks.map(c => Buffer.from(c.base64, 'base64'));
        return Buffer.concat(buffers);
    } catch (err) {
        throw new AppError(`Deepgram, ElevenLabs, and Google TTS Fallback all failed: ${err.message}`, 500, 'TTS_ERROR');
    }
};

/**
 * Convert text to speech using Deepgram Aura API
 * Returns a Buffer of MP3 audio data
 */
const synthesizeSpeech = (text, voiceId = 'aura-asteria-en') => {
    return new Promise((resolve, reject) => {
        const apiKey = config.deepgram.apiKey;

        if (!apiKey || apiKey === 'your_deepgram_api_key_here') {
            logger.warn('DEEPGRAM_API_KEY is not configured. Redirecting to Fallback.');
            return resolve(getFallbackTTS(text));
        }

        const body = JSON.stringify({ text });

        const options = {
            hostname: 'api.deepgram.com',
            path: `/v1/speak?model=${voiceId}&encoding=mp3`,
            method: 'POST',
            headers: {
                'Authorization': `Token ${apiKey}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            }
        };

        const req = https.request(options, (res) => {
            if (res.statusCode !== 200) {
                let errData = '';
                res.on('data', chunk => errData += chunk);
                res.on('end', () => {
                    logger.warn(`Deepgram TTS failed: HTTP ${res.statusCode} - ${errData}`);
                    resolve(getFallbackTTS(text));
                });
                return;
            }

            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                logger.info(`Deepgram TTS Success: Generated ${Buffer.concat(chunks).length} bytes`);
                resolve(Buffer.concat(chunks));
            });
        });

        req.on('error', (err) => {
            logger.warn(`Deepgram request failed: ${err.message}`);
            resolve(getFallbackTTS(text));
        });

        req.write(body);
        req.end();
    });
};

module.exports = {
    synthesizeSpeech,
};
