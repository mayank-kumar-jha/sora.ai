'use strict';

const { Router } = require('express');
const aiController = require('../controllers/aiController');
const { requireAuth } = require('../middleware/auth');

const router = Router();

router.use(requireAuth);

router.post('/message', aiController.sendMessage);

module.exports = router;
