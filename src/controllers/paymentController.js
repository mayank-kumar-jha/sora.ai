'use strict';

const paymentService = require('../services/paymentService');
const AppError = require('../utils/AppError');

/**
 * Handle subscription checkout
 */
const checkout = async (req, res, next) => {
    try {
        const { plan } = req.body;
        const userId = req.user.id;
        const userEmail = req.user.email;

        if (!['PRO', 'FREE'].includes(plan)) {
            throw new AppError('Invalid plan selected', 400);
        }

        const session = await paymentService.createCheckoutSession(userId, userEmail, plan);

        res.status(200).json({
            status: 'success',
            data: {
                sessionId: session.id,
                url: session.url
            }
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    checkout
};
