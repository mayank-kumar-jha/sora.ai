'use strict';

const stripe = require('stripe');
const config = require('../config/env');
const AppError = require('../utils/AppError');
const logger = require('../config/logger');

let stripeClient;
if (config.stripe.secretKey) {
    stripeClient = stripe(config.stripe.secretKey);
} else {
    logger.warn('Stripe secret key is missing. Payment features will be disabled.');
}

/**
 * Create a Stripe Checkout Session
 */
const createCheckoutSession = async (userId, userEmail, plan) => {
    if (!stripeClient) {
        throw new AppError('Payment service is not configured', 503, 'SERVICE_UNAVAILABLE');
    }
    try {
        const session = await stripeClient.checkout.sessions.create({
            payment_method_types: ['card'],
            customer_email: userEmail,
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: `Super AI Assistant - ${plan} Plan`,
                        },
                        unit_amount: plan === 'PRO' ? 1999 : 0, // 19.99 for Pro
                        recurring: { interval: 'month' }
                    },
                    quantity: 1,
                },
            ],
            mode: 'subscription',
            success_url: `${process.env.FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.FRONTEND_URL}/payment/cancel`,
            metadata: {
                userId,
                plan
            }
        });

        return session;
    } catch (error) {
        throw new AppError(`Stripe Error: ${error.message}`, 500, 'PAYMENT_ERROR');
    }
};

/**
 * Construct Stripe Webhook Event
 */
const constructEvent = (payload, sig) => {
    if (!stripeClient) {
        throw new AppError('Payment service is not configured', 503, 'SERVICE_UNAVAILABLE');
    }
    try {
        return stripeClient.webhooks.constructEvent(payload, sig, config.stripe.webhookSecret);
    } catch (error) {
        throw new AppError(`Webhook Error: ${error.message}`, 400, 'WEBHOOK_ERROR');
    }
};

module.exports = {
    createCheckoutSession,
    constructEvent
};
