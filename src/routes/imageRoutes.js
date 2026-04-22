'use strict';

const router = require('express').Router();
const image = require('../controllers/imageController');
const { authenticate } = require('../middleware/auth');

router.post('/generate', authenticate, image.generate);

module.exports = router;
