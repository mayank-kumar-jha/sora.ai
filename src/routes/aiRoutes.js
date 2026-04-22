'use strict';

const router = require('express').Router();
const ai = require('../controllers/aiController');
const { authenticate } = require('../middleware/auth');
router.post('/chat', authenticate, ai.chat);
router.get('/config', authenticate, ai.getConfig);

module.exports = router;
