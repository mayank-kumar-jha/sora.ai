'use strict';

const aiService = require('../services/aiService');
const prisma = require('../config/database');

const chat = async (req, res, next) => {
  try {
    const { message, context = [], image, conversationId } = req.body;
    if (!message) return res.status(400).json({ success: false, error: { message: 'message required' } });

    const result = await aiService.processMessage(req.user.id, message, context, image);

    // Save to DB in background
    prisma.conversation.create({
      data: { userId: req.user.id, conversationId, role: 'ASSISTANT', message: result.message || '' },
    }).catch(() => {});

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

const getConfig = async (req, res, next) => {
  try {
    const config = require('../config/env');
    res.json({ success: true, data: { geminiKey: config.gemini.apiKey } });
  } catch (err) {
    next(err);
  }
};

module.exports = { chat, getConfig };
