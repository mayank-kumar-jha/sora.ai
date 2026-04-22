'use strict';

const router = require('express').Router();

router.use('/auth', require('./authRoutes'));
router.use('/ai', require('./aiRoutes'));
router.use('/whatsapp', require('./whatsappRoutes'));
router.use('/documents', require('./documentRoutes'));
router.use('/voice', require('./voiceRoutes'));
router.use('/images', require('./imageRoutes'));
router.use('/payments', require('./paymentRoutes'));
// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '2.0.0' });
});

module.exports = router;
