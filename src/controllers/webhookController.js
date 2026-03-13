'use strict';

const paymentService = require('../services/paymentService');
const prisma = require('../config/database');
const logger = require('../config/logger');

/**
 * Handle Stripe Webhooks
 */
const handleWebhook = async (req, res, next) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = paymentService.constructEvent(req.body, sig);
    } catch (err) {
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    logger.info('Received Stripe Webhook', { type: event.type });

    try {
        switch (event.type) {
            case 'checkout.session.completed':
                await handleCheckoutSessionCompleted(event.data.object);
                break;
            case 'customer.subscription.deleted':
            case 'customer.subscription.updated':
                await handleSubscriptionChanged(event.data.object);
                break;
            default:
                logger.info(`Unhandled event type ${event.type}`);
        }

        res.json({ received: true });
    } catch (error) {
        logger.error('Webhook Processing Error', { error: error.message, type: event.type });
        res.status(500).send('Internal Server Error');
    }
};

const handleCheckoutSessionCompleted = async (session) => {
    const { userId, plan } = session.metadata;

    await prisma.subscription.updateMany({
        where: { userId },
        data: { status: 'CANCELLED' } // Reset old ones
    });

    await prisma.subscription.create({
        data: {
            userId,
            plan,
            status: 'ACTIVE',
            expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
        }
    });

    await prisma.user.update({
        where: { id: userId },
        data: { role: plan }
    });

    logger.info(`Subscription activated for user ${userId}`, { plan });
};

const handleSubscriptionChanged = async (subscription) => {
    const customerId = subscription.customer;
    // In a real app, look up user by Stripe customerId
    // For this demo, we assume the user update logic
};

module.exports = {
    handleWebhook
};
