'use strict';

const router = require('express').Router();
const payment = require('../controllers/paymentController');
const { authenticate } = require('../middleware/auth');

router.post('/checkout', authenticate, payment.createCheckout);

module.exports = router;
