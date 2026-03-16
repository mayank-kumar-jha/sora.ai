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
    const qrCode = whatsappService.getQrCode();
    
    sendSuccess(res, { 
        data: { 
            qrCode,
            status: status.status,
            isReady: status.isReady
        } 
    });
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
    if (!to || !message) throw new AppError('to and message are required.', 400);

    const result = await whatsappService.sendWhatsAppMessage(to, message);
    sendSuccess(res, { message: 'WhatsApp message sent.', data: result });
});

/**
 * POST /api/whatsapp/reset
 */
const resetSession = asyncHandler(async (req, res) => {
    await whatsappService.resetSession();
    
    // Auto-restart
    setTimeout(() => {
        whatsappService.initWhatsApp().catch(() => {});
    }, 2000);

    sendSuccess(res, { message: 'WhatsApp session reset. Connection will restart in 2 seconds.' });
});

/**
 * GET /api/whatsapp/qr/view
 */
const renderQrPage = asyncHandler(async (req, res) => {
    const status = whatsappService.getStatus();
    const qrCode = whatsappService.getQrCode();

    const getStatusColor = (s) => {
        switch(s) {
            case 'CONNECTED': return '#25d366';
            case 'ERROR': return '#ef4444';
            case 'WAITING_FOR_QR': return '#facc15';
            default: return '#888';
        }
    };

    if (status.isReady) {
        return res.send(`
            <html>
                <head>
                    <title>WhatsApp Status | Sora</title>
                    <style>
                        body { background: #0a0a1a; color: white; min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
                        .card { background: #111122; padding: 40px; border-radius: 20px; border: 1px solid #333; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
                        h1 { color: #25d366; font-size: 2.5rem; margin-bottom: 5px; }
                        .status { color: #888; text-transform: uppercase; letter-spacing: 2px; font-size: 0.8rem; margin-bottom: 20px; }
                        .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px; }
                        .stat-box { background: #1a1a2e; padding: 15px; border-radius: 10px; }
                        .count { font-size: 1.5rem; font-weight: bold; color: #25d366; }
                        .label { font-size: 0.7rem; color: #666; }
                        button { margin-top: 30px; padding: 12px 24px; border-radius: 8px; border: none; background: #333; color: white; cursor: pointer; transition: 0.3s; }
                        button:hover { background: #444; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <h1>Sora Connected</h1>
                        <div class="status">● Status: CONNECTED</div>
                        <div class="stat-grid">
                            <div class="stat-box"><div class="count">${status.contactsCount}</div><div class="label">Contacts</div></div>
                            <div class="stat-box"><div class="count">${status.chatsCount}</div><div class="label">Chats</div></div>
                        </div>
                        <p style="color: #666; font-size: 0.9rem; margin-top: 20px;">${status.syncing ? '🔄 Initializing history sync...' : '✨ Session is active and healthy.'}</p>
                        <button onclick="location.reload()">Refresh Status</button>
                    </div>
                </body>
            </html>
        `);
    }

    res.send(`
        <html>
            <head>
                <title>Connect WhatsApp | Sora</title>
                <style>
                    body { background: #0a0a1a; color: white; min-height: 100vh; font-family: sans-serif; margin: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
                    .card { background: #111122; padding: 40px; border-radius: 20px; border: 1px solid #333; text-align: center; max-width: 400px; }
                    .qr-box { background: white; padding: 15px; border-radius: 10px; margin: 20px 0; }
                    .qr-box img { display: block; filter: contrast(1.1); }
                    .status-line { color: ${getStatusColor(status.status)}; font-size: 0.8rem; margin-bottom: 10px; letter-spacing: 1px; }
                    h1 { margin: 0; font-weight: 300; }
                    p { color: #666; font-size: 0.9rem; line-height: 1.5; }
                    .btn-reset { margin-top: 40px; color: #ef4444; background: transparent; border: 1px solid #ef4444; padding: 8px 16px; border-radius: 5px; cursor: pointer; font-size: 0.7rem; }
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="status-line" style="color: ${getStatusColor(status.status)}">STATUS: ${status.status}</div>
                    ${status.lastError ? `<div style="color: #ef4444; font-size: 0.7rem; margin-bottom: 10px; opacity: 0.8;">ERROR: ${status.lastError}</div>` : ''}
                    <h1>Connect WhatsApp</h1>
                    <p>Scan the code below using WhatsApp on your phone to link it with Sora.</p>
                    <div class="qr-box">
                        ${qrCode ? `<img src="${qrCode}" width="300" height="300">` : `<div style="width:300px; height:300px; display:flex; align-items:center; justify-content:center; color:#000;">${status.status === 'INITIALIZING' ? 'Initializing Connection...' : 'Generating QR Code...'}</div>`}
                    </div>
                    <p>This code is unique to your session.</p>
                    <button class="btn-reset" onclick="resetSession()">Hard Reset Session</button>
                </div>
                <script>
                    async function resetSession() {
                        if(!confirm('Reset current session?')) return;
                        const res = await fetch('/api/whatsapp/reset', {method: 'POST'});
                        const data = await res.json();
                        alert(data.message);
                        location.reload();
                    }
                    setTimeout(() => { if(!window.manualRefresh) location.reload(); }, ${qrCode ? 30000 : 5000});
                </script>
            </body>
        </html>
    `);
});

/**
 * GET /api/whatsapp/pairing-code?phoneNumber=...
 */
const getPairingCode = asyncHandler(async (req, res) => {
    const { phoneNumber } = req.query;
    if (!phoneNumber) throw new AppError('phoneNumber is required.', 400);

    const cleanNumber = phoneNumber.replace(/\D/g, '');
    const code = await whatsappService.requestPairingCode(cleanNumber);
    
    sendSuccess(res, { 
        message: 'Pairing code generated successfully.', 
        data: { pairingCode: code } 
    });
});

module.exports = {
    getStatus, getQrCode, getChats, sendMessage, renderQrPage, resetSession, getPairingCode
};
