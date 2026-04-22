'use strict';

const whatsappService = require('../services/whatsappService');

const getStatus = (req, res) => {
  const status = whatsappService.getStatus();
  res.json({ success: true, data: status });
};

const getQrCode = (req, res) => {
  const qr = whatsappService.getQrCode();

  if (req.accepts('html')) {
    if (!qr) {
      return res.send(`
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; font-family:sans-serif; background:#f5f5f5;">
          <h2>No QR Code available</h2>
          <p>WhatsApp might already be connected, or the server is still initializing.</p>
        </div>
      `);
    }
    return res.send(`
      <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; font-family:sans-serif; background:#f5f5f5;">
        <h2>Scan this with WhatsApp to link Kaaya</h2>
        <img src="${qr}" style="border:16px solid white; border-radius:12px; box-shadow:0 4px 24px rgba(0,0,0,0.1);" width="350" />
      </div>
    `);
  }

  if (!qr) return res.json({ success: true, data: { hasQr: false } });
  res.json({ success: true, data: { hasQr: true, qr } });
};

const sendMessage = async (req, res, next) => {
  try {
    const { to, message } = req.body;
    if (!to || !message) return res.status(400).json({ success: false, error: { message: 'to and message required' } });
    const result = await whatsappService.sendWhatsAppMessage(to, message);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

const resetSession = async (req, res, next) => {
  try {
    await whatsappService.resetSession();
    res.json({ success: true, message: 'WhatsApp session reset. Scan a new QR code.' });
  } catch (err) {
    next(err);
  }
};

const requestPincode = async (req, res, next) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.status(400).json({ success: false, error: { message: 'phoneNumber is required' } });
    const code = await whatsappService.requestPairingCode(phoneNumber);
    res.json({ success: true, data: { pairingCode: code } });
  } catch (err) {
    next(err);
  }
};

const getContacts = (req, res) => {
  res.json({ success: true, data: whatsappService.getContacts() });
};

const getRecentChats = (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  res.json({ success: true, data: whatsappService.getRecentChats(limit) });
};

module.exports = { getStatus, getQrCode, sendMessage, resetSession, requestPincode, getContacts, getRecentChats: getRecentChats, getChats: getRecentChats };
