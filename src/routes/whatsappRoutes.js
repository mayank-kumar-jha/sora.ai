'use strict';

const { Router } = require('express');
const whatsappController = require('../controllers/whatsappController');
const { requireAuth } = require('../middleware/auth'); // Import from auth instead of requireAuth

const router = Router();

// Unprotected route for easy development access (renders an HTML page with the QR)
router.get('/qr/view', whatsappController.renderQrPage);

// Require auth for all other WhatsApp routes 
router.use(requireAuth);

router.get('/status', whatsappController.getStatus);
router.get('/qr', whatsappController.getQrCode);
router.get('/chats', whatsappController.getChats);
router.post('/send', whatsappController.sendMessage);

module.exports = router;
