'use strict';

const router = require('express').Router();
const wa = require('../controllers/whatsappController');
const { authenticate } = require('../middleware/auth');

router.get('/status', wa.getStatus);
router.get('/qr', wa.getQrCode);
router.post('/send', authenticate, wa.sendMessage);
router.post('/reset', authenticate, wa.resetSession);
router.post('/pincode', authenticate, wa.requestPincode);
router.get('/contacts', authenticate, wa.getContacts);
router.get('/chats', authenticate, wa.getChats);
module.exports = router;
