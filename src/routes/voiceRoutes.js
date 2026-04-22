'use strict';

const router = require('express').Router();
const voice = require('../controllers/voiceController');
const { authenticate } = require('../middleware/auth');
const multer = require('multer');

// Configure multer for temp file upload, preserving extension immediately
const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => {
    // Generate unique name and append m4a extension
    cb(null, `audio-${Date.now()}-${Math.round(Math.random() * 1E9)}.m4a`);
  }
});
const upload = multer({ storage });

router.post('/synthesize', authenticate, voice.synthesize);
router.post('/transcribe', authenticate, upload.single('audio'), voice.transcribe);

module.exports = router;
