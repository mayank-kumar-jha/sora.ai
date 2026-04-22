#!/usr/bin/env node
'use strict';

const { io } = require('socket.io-client');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const SERVER_URL = process.env.TEST_SERVER_URL || 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_SECRET || 'kaaya_default_secret_fallback';

const testToken = jwt.sign(
    { sub: 'test-video-user-001', email: 'test@kaaya.ai', role: 'user' },
    JWT_SECRET,
    { expiresIn: '1h' }
);

console.log('\n╔══════════════════════════════════════════════════╗');
console.log('║    Gemini Live Video Integration Test            ║');
console.log('╚══════════════════════════════════════════════════╝\n');

const socket = io(SERVER_URL, {
    auth: { token: testToken },
    transports: ['websocket'],
});

socket.on('connect', () => {
    console.log('✅ Connected to server via Socket.IO');
    console.log('📡 Starting Gemini Live session with VIDEO enabled...');
    socket.emit('live:start', { videoEnabled: true });
});

socket.on('live:ready', (data) => {
    console.log(`✅ Live session ready! Session ID: ${data.sessionId}`);

    // Read a dummy image to send as a video frame
    const imagePath = path.join(__dirname, '../whatsapp-qr.png');
    if (!fs.existsSync(imagePath)) {
        console.error("❌ Test aborted: Need an image to simulate video frames (whatsapp-qr.png missing).");
        process.exit(1);
    }

    const imageBuffer = fs.readFileSync(imagePath);
    const base64Data = imageBuffer.toString('base64');

    console.log('📸 Sending video frame (QR Code scan)...');
    socket.emit('live:video', {
        mimeType: 'image/png',
        data: base64Data
    });

    // Ask it what it sees
    setTimeout(() => {
        console.log('💬 Asking what it sees...');
        socket.emit('live:text', { text: 'What do you see in the video frame I just sent?' });
    }, 1500);

    // Stop after a bit
    setTimeout(() => {
        socket.emit('live:stop');
    }, 12000);
});

socket.on('live:transcript', (data) => {
    const label = data.type === 'input' ? '🗣️  User' : '🤖 Kaaya';
    console.log(`\n${label}: ${data.text}`);
});

socket.on('live:audio', (data) => {
    console.log(`🔊 Received audio (${data.data?.length || 0} base64 chars)`);
});

socket.on('live:error', (data) => {
    console.log(`❌ Live error: ${data.message}`);
});

socket.on('live:ended', () => {
    console.log('\n🛑 Session stopped successfully.');
    socket.disconnect();
    process.exit(0);
});

// Timeout
setTimeout(() => {
    console.log('\n⏰ Timeout reached.');
    process.exit(1);
}, 20000);
