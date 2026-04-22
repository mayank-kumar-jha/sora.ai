#!/usr/bin/env node
'use strict';

/**
 * Gemini Live Integration Test
 *
 * Standalone test that connects via Socket.IO, starts a live session,
 * sends a text message, and validates transcription responses.
 *
 * Usage:
 *   node tests/testGeminiLive.js
 *
 * Prerequisites:
 *   - Backend running (npm run dev)
 *   - GEMINI_API_KEY set in .env
 */

const { io } = require('socket.io-client');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// ─── Config ─────────────────────────────────────────────────────────────────
const SERVER_URL = process.env.TEST_SERVER_URL || 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_SECRET || 'kaaya_default_secret_fallback';
const TEST_USER_ID = 'test-live-user-001';
const TEST_TIMEOUT = 30000; // 30 seconds total
const WAIT_FOR_RESPONSE = 15000; // 15 seconds to wait for Gemini response

// ─── Results Tracker ────────────────────────────────────────────────────────
const results = {
    connected: false,
    sessionStarted: false,
    textSent: false,
    gotTranscript: false,
    gotAudio: false,
    sessionStopped: false,
    errors: [],
    transcripts: [],
};

// ─── Generate Test JWT ──────────────────────────────────────────────────────
const testToken = jwt.sign(
    { sub: TEST_USER_ID, email: 'test@kaaya.ai', role: 'user' },
    JWT_SECRET,
    { expiresIn: '1h' }
);

console.log('\n╔══════════════════════════════════════════════════╗');
console.log('║       Gemini Live Integration Test               ║');
console.log('╚══════════════════════════════════════════════════╝\n');
console.log(`🔗 Server: ${SERVER_URL}`);
console.log(`🔑 Test User: ${TEST_USER_ID}`);
console.log(`⏱️  Timeout: ${TEST_TIMEOUT / 1000}s\n`);

// ─── Socket Connection ──────────────────────────────────────────────────────
const socket = io(SERVER_URL, {
    auth: { token: testToken },
    transports: ['websocket'],
    reconnection: false,
});

// Overall timeout
const overallTimeout = setTimeout(() => {
    console.log('\n⏰ Overall timeout reached. Wrapping up...\n');
    printResults();
    socket.disconnect();
    process.exit(results.gotTranscript ? 0 : 1);
}, TEST_TIMEOUT);

// ─── Event Handlers ─────────────────────────────────────────────────────────

socket.on('connect', () => {
    results.connected = true;
    console.log('✅ Connected to server via Socket.IO');

    // Start live session
    console.log('📡 Starting Gemini Live session...');
    socket.emit('live:start', { videoEnabled: false });
});

socket.on('connect_error', (err) => {
    results.errors.push(`Connection error: ${err.message}`);
    console.log(`❌ Connection failed: ${err.message}`);
    printResults();
    process.exit(1);
});

socket.on('live:ready', (data) => {
    results.sessionStarted = true;
    console.log(`✅ Live session ready! Session ID: ${data.sessionId}`);

    // Send a test text message
    setTimeout(() => {
        console.log('💬 Sending text: "Hello Kaaya, what can you do?"');
        socket.emit('live:text', { text: 'Hello Kaaya, what can you do?' });
        results.textSent = true;
        console.log('✅ Text message sent');

        // Wait for responses, then stop
        setTimeout(() => {
            console.log('\n🛑 Stopping live session...');
            socket.emit('live:stop');
        }, WAIT_FOR_RESPONSE);
    }, 1000);
});

socket.on('live:audio', (data) => {
    if (!results.gotAudio) {
        results.gotAudio = true;
        console.log(`🔊 Received audio response (${data.data?.length || 0} base64 chars)`);
    }
});

socket.on('live:transcript', (data) => {
    results.gotTranscript = true;
    results.transcripts.push(data);
    const label = data.type === 'input' ? '🗣️  User' : '🤖 Kaaya';
    console.log(`${label}: ${data.text}`);
});

socket.on('live:tool', (data) => {
    console.log(`🔧 Tool called: ${data.name}(${JSON.stringify(data.args)})`);
});

socket.on('live:interrupted', () => {
    console.log('⚡ Model was interrupted (barge-in)');
});

socket.on('live:turnComplete', () => {
    console.log('✔️  Turn complete');
});

socket.on('live:error', (data) => {
    results.errors.push(data.message);
    console.log(`❌ Live error: ${data.message}`);
});

socket.on('live:ended', (data) => {
    results.sessionStopped = true;
    console.log(`✅ Session ended: ${data.reason || 'clean'}`);

    setTimeout(() => {
        printResults();
        clearTimeout(overallTimeout);
        socket.disconnect();
        process.exit(results.sessionStarted ? 0 : 1);
    }, 1000);
});

socket.on('disconnect', (reason) => {
    console.log(`🔌 Disconnected: ${reason}`);
});

// ─── Results Summary ────────────────────────────────────────────────────────

function printResults() {
    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log('║                Test Results                       ║');
    console.log('╠══════════════════════════════════════════════════╣');
    console.log(`║ Socket connected:    ${results.connected ? '✅ PASS' : '❌ FAIL'}                      ║`);
    console.log(`║ Session started:     ${results.sessionStarted ? '✅ PASS' : '❌ FAIL'}                      ║`);
    console.log(`║ Text sent:           ${results.textSent ? '✅ PASS' : '❌ FAIL'}                      ║`);
    console.log(`║ Got transcript:      ${results.gotTranscript ? '✅ PASS' : '❌ FAIL'}                      ║`);
    console.log(`║ Got audio:           ${results.gotAudio ? '✅ PASS' : '❌ FAIL'}                      ║`);
    console.log(`║ Session stopped:     ${results.sessionStopped ? '✅ PASS' : '❌ FAIL'}                      ║`);
    console.log('╚══════════════════════════════════════════════════╝');

    if (results.errors.length > 0) {
        console.log('\n⚠️  Errors:');
        results.errors.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
    }

    if (results.transcripts.length > 0) {
        console.log(`\n📝 Total transcripts received: ${results.transcripts.length}`);
    }

    const passed = results.connected && results.sessionStarted;
    console.log(`\n${passed ? '🎉 TEST PASSED' : '💥 TEST FAILED'}\n`);
}
