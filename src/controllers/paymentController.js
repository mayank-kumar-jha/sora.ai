'use strict';

const paymentService = require('../services/paymentService');

const createCheckout = async (req, res, next) => {
  try {
    const { plan, priceId } = req.body;
    if (!plan || !priceId) return res.status(400).json({ success: false, error: { message: 'plan and priceId required' } });

    const result = await paymentService.createCheckoutSession(req.user.id, plan, priceId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

const webhook = async (req, res, next) => {
  try {
    const sig = req.headers['stripe-signature'];
    await paymentService.handleWebhook(req.body, sig);
    res.json({ received: true });
  } catch (err) {
    next(err);
  }
};

module.exports = { createCheckout, webhook };
