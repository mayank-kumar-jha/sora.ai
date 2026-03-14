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
 * GET /api/whatsapp/pairing-code?phoneNumber=...
 */
const getPairingCode = asyncHandler(async (req, res) => {
    const { phoneNumber } = req.query;

    if (!phoneNumber) {
        throw new AppError('phoneNumber is required.', 400, 'VALIDATION_ERROR');
    }

    // Clean phone number: remove +, space, -, etc.
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    const code = await whatsappService.requestPairingCode(cleanNumber);
    
    sendSuccess(res, { 
        message: 'Pairing code generated successfully.', 
        data: { pairingCode: code } 
    });
});

/**
 * POST /api/whatsapp/reset
 */
const resetSession = asyncHandler(async (req, res) => {
    await whatsappService.resetSession();
    
    // Optionally restart the connection automatically
    setTimeout(() => {
        whatsappService.initWhatsApp().catch(err => {
            console.error('Failed to restart WhatsApp after reset:', err);
        });
    }, 2000);

    sendSuccess(res, { message: 'WhatsApp session reset. Connection will restart in 2 seconds.' });
});

/**
 * GET /api/whatsapp/qr/view (UNPROTECTED DEV ONLY)
 */
const renderQrPage = asyncHandler(async (req, res) => {
    const status = whatsappService.getStatus();
    if (status.isReady) {
        return res.send(`
            <html>
                <head>
                    <style>
                        body { background: #0a0a1a; color: white; min-height: 100vh; font-family: sans-serif; margin: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
                        h1 { font-weight: 300; color: #25d366; }
                        .stat-card { background: #1a1a2e; padding: 20px; border-radius: 10px; margin-top: 20px; border: 1px solid #333; }
                        .count { font-size: 36px; font-weight: bold; color: #25d366; }
                        .label { color: #888; text-transform: uppercase; font-size: 12px; letter-spacing: 1px; }
                        .sync-msg { color: #facc15; margin-top: 10px; font-size: 14px; }
                    </style>
                </head>
                <body>
                    <h1>✅ Sora is Connected!</h1>
                    <div class="stat-card">
                        <div class="count">${status.contactsCount || 0}</div>
                        <div class="label">Contacts Indexed</div>
                        <div class="sync-msg">${status.syncing ? '🔄 Still syncronizing history... this can take 5-10 minutes.' : '✨ Full sync complete.'}</div>
                    </div>
                    <p style="margin-top: 30px;"><button onclick="location.reload()" style="padding: 10px 20px; border-radius: 5px; border: none; background: #333; color: white; cursor: pointer;">Refresh Status</button></p>
                    <script>setTimeout(() => location.reload(), 10000);</script>
                </body>
            </html>
        `);
    }

    const qrCode = whatsappService.getQrCode();
    if (!qrCode) {
        return res.send('<h1>QR Code is still generating... Refresh in 5 seconds.</h1><script>setTimeout(()=>location.reload(), 5000)</script>');
    }

    res.send(`
        <html>
            <head>
                <style>
                    body { background: #0a0a1a; color: white; min-height: 100vh; font-family: sans-serif; margin: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
                    .container { text-align: center; max-width: 500px; padding: 20px; }
                    .qr-container { background: white; padding: 20px; border-radius: 10px; margin-bottom: 20px; display: inline-block; }
                    .qr-container img { display: block; }
                    h1 { margin-bottom: 10px; font-weight: 300; }
                    p { color: #888; margin-bottom: 20px; }
                    .pairing-section { margin-top: 30px; border-top: 1px solid #333; padding-top: 20px; width: 100%; }
                    input { padding: 12px; border-radius: 5px; border: none; width: 70%; margin-bottom: 10px; font-size: 16px; }
                    button { padding: 12px 24px; border-radius: 5px; border: none; background: #25d366; color: white; font-weight: bold; cursor: pointer; transition: 0.3s; }
                    button:hover { background: #128c7e; }
                    #code-display { font-size: 32px; font-weight: bold; color: #25d366; margin-top: 20px; letter-spacing: 5px; }
                    .small-link { color: #888; text-decoration: none; font-size: 12px; margin-top: 10px; display: block; cursor: pointer; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>Link WhatsApp to Sora</h1>
                    <p>Method 1: Scan QR Code</p>
                    <div class="qr-container">
                        <img src="${qrCode}" width="300" height="300" />
                    </div>
                    
                    <div class="pairing-section">
                        <p>Method 2: Use Pairing Code</p>
                        <input type="text" id="phone" placeholder="919899177436" value="919899177436">
                        <button onclick="getPairingCode()">Get Code</button>
                        <div id="code-display"></div>
                    </div>

                    <div style="margin-top: 40px;">
                        <span class="small-link" onclick="resetSession()" style="color: #ef4444; border: 1px solid #ef4444; padding: 5px 10px; border-radius: 5px;">⚠️ Hard Reset Session</span>
                        <p style="font-size: 11px; margin-top: 5px;">Use this ONLY if you see "cannot connect" on your phone.</p>
                    </div>
                </div>

                <script>
                    async function resetSession() {
                        if (!confirm('This will wipe your current session and restart WhatsApp. Continue?')) return;
                        
                        try {
                            const res = await fetch('/api/whatsapp/reset', { method: 'POST' });
                            const json = await res.json();
                            alert(json.message);
                            location.reload();
                        } catch (e) {
                            alert('Reset failed');
                        }
                    }

                    async function getPairingCode() {
                        const phone = document.getElementById('phone').value;
                        if (!phone) return alert('Phone number is required');
                        
                        const btn = document.querySelector('button');
                        btn.disabled = true;
                        btn.innerText = 'Requesting...';
                        
                        try {
                            const res = await fetch(\`/api/whatsapp/pairing-code?phoneNumber=\${phone}\`);
                            const json = await res.json();
                            if (json.status === 'success') {
                                document.getElementById('code-display').innerText = json.data.pairingCode;
                            } else {
                                alert('Error: ' + json.message);
                            }
                        } catch (e) {
                            alert('Failed to get pairing code');
                        } finally {
                            btn.disabled = false;
                            btn.innerText = 'Get Code';
                        }
                    }

                    // Refresh page every 60 seconds to refresh QR if it's not connected
                    // (Unless we just got a pairing code)
                    setInterval(() => {
                        if (!document.getElementById('code-display').innerText) {
                            location.reload();
                        }
                    }, 60000);
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
    renderQrPage,
    getPairingCode,
    resetSession
};
