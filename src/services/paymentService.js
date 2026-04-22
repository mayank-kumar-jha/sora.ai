'use strict';

const stripe = require('stripe');
const config = require('../config/env');
const prisma = require('../config/database');
const logger = require('../config/logger');

const getStripe = () => {
  if (!config.stripe.secretKey || config.stripe.secretKey.includes('placeholder')) {
    return null;
  }
  return stripe(config.stripe.secretKey);
};

/**
 * Create a Stripe Checkout session for a subscription plan.
 */
const createCheckoutSession = async (userId, plan, priceId) => {
  const stripeClient = getStripe();
  if (!stripeClient) {
    throw new Error('Stripe is not configured. API key will be provided later.');
  }

  const session = await stripeClient.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/success`,
    cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/cancel`,
    metadata: { userId, plan },
  });

  // Record payment
  await prisma.payment.create({
    data: { userId, stripeSessionId: session.id, plan, status: 'pending' },
  });

  return { url: session.url, sessionId: session.id };
};

/**
 * Handle Stripe webhook events.
 */
const handleWebhook = async (rawBody, signature) => {
  const stripeClient = getStripe();
  if (!stripeClient) return;

  const event = stripeClient.webhooks.constructEvent(rawBody, signature, config.stripe.webhookSecret);

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      await prisma.payment.updateMany({
        where: { stripeSessionId: session.id },
        data: { status: 'completed', amount: session.amount_total || 0 },
      });

      // Upgrade user to PRO
      if (session.metadata?.userId) {
        await prisma.user.update({
          where: { id: session.metadata.userId },
          data: { role: 'PRO' },
        });
      }
      logger.info(`[Payment] Checkout completed: ${session.id}`);
      break;
    }
    default:
      logger.info(`[Payment] Unhandled event: ${event.type}`);
  }
};

module.exports = { createCheckoutSession, handleWebhook };
