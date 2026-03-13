'use strict';

const https = require('https');
const AppError = require('../utils/AppError');
const logger = require('../config/logger');
const googleTTS = require('google-tts-api');

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
// Free-tier default voice: "Sarah" (Mature, Reassuring, Confident)
const DEFAULT_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL';
const MODEL_ID = 'eleven_multilingual_v2';

const getFallbackTTS = async (text) => {
    logger.warn('Using Google TTS API Fallback for voice synthesis.');
    try {
        const chunks = await googleTTS.getAllAudioBase64(text, { lang: 'en', slow: false });
        const buffers = chunks.map(c => Buffer.from(c.base64, 'base64'));
        return Buffer.concat(buffers);
    } catch (err) {
        throw new AppError(`Both ElevenLabs and Google TTS Fallback failed: ${err.message}`, 500, 'TTS_ERROR');
    }
};

/**
 * Convert text to speech using ElevenLabs API
 * Returns a Buffer of MP3 audio data
 */
const synthesizeSpeech = (text, voiceId = DEFAULT_VOICE_ID) => {
    return new Promise((resolve, reject) => {
        if (!ELEVENLABS_API_KEY || ELEVENLABS_API_KEY === 'your_elevenlabs_api_key_here') {
            logger.warn('ELEVENLABS_API_KEY is not configured. Redirecting to Fallback.');
            return resolve(getFallbackTTS(text));
        }


        const body = JSON.stringify({
            text,
            model_id: MODEL_ID,
            voice_settings: {
                stability: 0.5,
                similarity_boost: 0.75,
                style: 0.0,
                use_speaker_boost: true
            }
        });

        const options = {
            hostname: 'api.elevenlabs.io',
            path: `/v1/text-to-speech/${voiceId}`,
            method: 'POST',
            headers: {
                'Accept': 'audio/mpeg',
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
                'xi-api-key': ELEVENLABS_API_KEY,
            }
        };

        const req = https.request(options, (res) => {
            if (res.statusCode !== 200) {
                let errData = '';
                res.on('data', chunk => errData += chunk);
                res.on('end', () => {
                    logger.warn(`ElevenLabs TTS failed: HTTP ${res.statusCode} - ${errData}`);
                    resolve(getFallbackTTS(text));
                });
                return;
            }

            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        });

        req.on('error', (err) => {
            logger.warn(`ElevenLabs request failed: ${err.message}`);
            resolve(getFallbackTTS(text));
        });
        req.write(body);
        req.end();
    });
};

module.exports = {
    synthesizeSpeech,
};
