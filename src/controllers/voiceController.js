'use strict';

const voiceService = require('../services/voiceService');

const synthesize = async (req, res, next) => {
  try {
    const { text, voiceId } = req.body;
    if (!text) return res.status(400).json({ success: false, error: { message: 'text required' } });

    const audioBuffer = await voiceService.synthesize(text, voiceId);
    res.set({ 'Content-Type': 'audio/mpeg', 'Content-Length': audioBuffer.length });
    res.send(audioBuffer);
  } catch (err) {
    next(err);
  }
};

const transcribe = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: { message: 'Audio file required' } });
    }

    const text = await voiceService.transcribe(req.file.path);
    
    // Clean up temp file
    require('fs').unlink(req.file.path, () => {});

    res.json({ success: true, data: { text } });
  } catch (err) {
    if (req.file?.path) require('fs').unlink(req.file.path, () => {});
    next(err);
  }
};

module.exports = { synthesize, transcribe };
