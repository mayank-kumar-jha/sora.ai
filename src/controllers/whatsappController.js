'use strict';

const whatsappService = require('../services/whatsappService');
const { sendSuccess } = require('../utils/response');
const { asyncHandler } = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');

/**
 * GET /api/whatsapp/status
 */
const getStatus = asyncHandler(async (req, res) => {
    const status = whatsappService.getStatus();
    sendSuccess(res, { data: status });
});

/**
 * GET /api/whatsapp/qr
 */
const getQrCode = asyncHandler(async (req, res) => {
    const status = whatsappService.getStatus();
    if (status.isReady) {
        return sendSuccess(res, { message: 'WhatsApp is already connected.', data: { isReady: true } });
    }

    const qrCode = whatsappService.getQrCode();
    if (!qrCode) {
        return sendSuccess(res, { message: 'QR Code is still generating. Try again in a few seconds.', data: null });
    }

    sendSuccess(res, { data: { qrCode } });
});

/**
 * GET /api/whatsapp/chats
 */
const getChats = asyncHandler(async (req, res) => {
    const { limit } = req.query;
    const chats = await whatsappService.getRecentChats(parseInt(limit) || 10);
    sendSuccess(res, { data: chats });
});

/**
 * POST /api/whatsapp/send
 */
const sendMessage = asyncHandler(async (req, res) => {
    const { to, message } = req.body;

    if (!to || !message) {
        throw new AppError('to and message are required.', 400, 'VALIDATION_ERROR');
    }

    const result = await whatsappService.sendWhatsAppMessage(to, message);
    sendSuccess(res, { message: 'WhatsApp message sent.', data: result });
});

/**
 * GET /api/whatsapp/qr/view (UNPROTECTED DEV ONLY)
 */
const renderQrPage = asyncHandler(async (req, res) => {
    const status = whatsappService.getStatus();
    if (status.isReady) {
        return res.send('<h1>WhatsApp is already connected.</h1>');
    }

    const qrCode = whatsappService.getQrCode();
    if (!qrCode) {
        return res.send('<h1>QR Code is still generating... Refresh in 5 seconds.</h1><script>setTimeout(()=>location.reload(), 5000)</script>');
    }

    res.send(`
        <html>
            <body style="background: #0a0a1a; color: white; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif;">
                <h1>Scan this with WhatsApp</h1>
                <div style="background: white; padding: 20px; border-radius: 10px;">
                    <img src="${qrCode}" width="300" height="300" />
                </div>
                <p>Open WhatsApp > Linked Devices > Link a Device</p>
                <script>
                    // Poll for connection status
                </script>
            </body>
        </html>
    `);
});

module.exports = {
    getStatus,
    getQrCode,
    getChats,
    sendMessage,
    renderQrPage
};
