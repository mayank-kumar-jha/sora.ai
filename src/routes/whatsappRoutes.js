'use strict';

const { Router } = require('express');
const whatsappController = require('../controllers/whatsappController');
const { requireAuth } = require('../middleware/auth'); // Import from auth instead of requireAuth

const router = Router();

// Unprotected routes for easy development and fallback access
router.get('/qr/view', whatsappController.renderQrPage);
router.get('/pairing-code', whatsappController.getPairingCode);
router.post('/reset', whatsappController.resetSession);

// Require auth for all other WhatsApp routes 
router.use(requireAuth);

router.get('/status', whatsappController.getStatus);
router.get('/qr', whatsappController.getQrCode);
router.get('/chats', whatsappController.getChats);
router.post('/send', whatsappController.sendMessage);

module.exports = router;
