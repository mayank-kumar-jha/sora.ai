'use strict';

const https = require('https');
const config = require('../config/env');
const logger = require('../config/logger');

/**
 * Google TTS fallback (free, no API key needed).
 */
const googleTTSFallback = async (text) => {
  logger.warn('[Voice] Using Google TTS fallback');
  try {
    const googleTTS = require('google-tts-api');
    const chunks = await googleTTS.getAllAudioBase64(text, { lang: 'en', slow: false });
    const buffers = chunks.map((c) => Buffer.from(c.base64, 'base64'));
    return Buffer.concat(buffers);
  } catch (err) {
    throw new Error(`All TTS engines failed: ${err.message}`);
  }
};

/**
 * Deepgram voice mapping (legacy ElevenLabs IDs → Deepgram Aura models).
 */
const VOICE_MAP = {
  'EXAVITQu4vr4xnSDxMaL': 'aura-asteria-en',
  '21m00Tcm4TlvDq8ikWAM': 'aura-luna-en',
  'pNInz6obpgDQGcFmaJgB': 'aura-orion-en',
  'ErXwobaYiN019PkySvjV': 'aura-arcas-en',
  'VR6AewLTigWG4xSOukaG': 'aura-perseus-en',
  'MF3mGyEYCl7XYWbV9V6O': 'aura-stella-en',
};

/**
 * Synthesize speech using Deepgram Aura TTS.
 * Falls back to Google TTS on failure.
 */
const synthesize = (text, voiceId = 'aura-asteria-en') => {
  return new Promise((resolve) => {
    const mapped = VOICE_MAP[voiceId] || (voiceId?.startsWith('aura-') ? voiceId : 'aura-asteria-en');
    const apiKey = config.deepgram.apiKey;

    if (!apiKey) {
      return resolve(googleTTSFallback(text));
    }

    const body = JSON.stringify({ text });
    const options = {
      hostname: 'api.deepgram.com',
      path: `/v1/speak?model=${mapped}&encoding=mp3`,
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        let errData = '';
        res.on('data', (chunk) => (errData += chunk));
        res.on('end', () => {
          logger.warn(`[Voice] Deepgram failed: ${res.statusCode} ${errData}`);
          resolve(googleTTSFallback(text));
        });
        return;
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });

    req.on('error', (err) => {
      logger.warn(`[Voice] Deepgram request error: ${err.message}`);
      resolve(googleTTSFallback(text));
    });

    req.write(body);
    req.end();
  });
};

/**
 * Transcribe audio using Groq Whisper.
 */
const transcribe = async (filePath) => {
    try {
        const fs = require('fs');
        const Groq = require('groq-sdk');
        const groq = new Groq({ apiKey: config.groq.apiKey });
        const transcription = await groq.audio.transcriptions.create({
            file: fs.createReadStream(filePath),
            model: "whisper-large-v3",
            response_format: "json",
            language: "en",
        });
        return transcription.text;
    } catch (err) {
        logger.error(`[Voice] Transcription failed: ${err.message}`);
        throw err;
    }
};

module.exports = { synthesize, transcribe };
