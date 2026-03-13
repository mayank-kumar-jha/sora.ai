'use strict';

const { Router } = require('express');
const healthRoutes = require('./healthRoutes');
const authRoutes = require('./authRoutes');
const googleRoutes = require('./googleRoutes');
const voiceRoutes = require('./voiceRoutes');
const aiRoutes = require('./aiRoutes');
const documentRoutes = require('./documentRoutes');
const paymentRoutes = require('./paymentRoutes');
const taskRoutes = require('./taskRoutes');
const whatsappRoutes = require('./whatsappRoutes');

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/google', googleRoutes);
router.use('/voice', voiceRoutes);
router.use('/ai', aiRoutes);
router.use('/documents', documentRoutes);
router.use('/payments', paymentRoutes);
router.use('/tasks', taskRoutes);
router.use('/whatsapp', whatsappRoutes);

// More route namespaces will be added in subsequent phases

module.exports = router;
