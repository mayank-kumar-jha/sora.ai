require('dotenv').config();
const { synthesizeSpeech } = require('./src/services/elevenLabsService');

async function test() {
    try {
        console.log('Testing ElevenLabs...');
        await synthesizeSpeech('Hello world');
        console.log('Success!');
    } catch (err) {
        console.error('Failed:', err.message);
    }
}

test();
