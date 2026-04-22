'use strict';

const imageService = require('../services/imageService');

const generate = async (req, res, next) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ success: false, error: { message: 'prompt required' } });

    const result = await imageService.generateImage(prompt);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

module.exports = { generate };
