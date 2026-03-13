'use strict';

const express = require('express');
const paymentController = require('../controllers/paymentController');
const { requireAuth } = require('../middleware/auth');
const validateRequest = require('../middleware/validateRequest');
const { z } = require('zod');

const router = express.Router();

const checkoutSchema = z.object({
    plan: z.enum(['FREE', 'PRO'])
});

router.use(requireAuth);

router.post('/checkout', validateRequest(checkoutSchema), paymentController.checkout);

module.exports = router;
