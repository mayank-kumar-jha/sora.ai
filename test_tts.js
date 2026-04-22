require('dotenv').config();
const { synthesize } = require('./src/services/voiceService');
const fs = require('fs');

async function test() {
    try {
        console.log('Testing TTS (Deepgram/Google fallback)...');
        const audio = await synthesize('Hello! I am Kaaya, your AI assistant. How can I help you today?');
        const outFile = 'test_voice_output.mp3';
        fs.writeFileSync(outFile, audio);
        console.log(`✅ Success! Audio saved to ${outFile} (${audio.length} bytes)`);
    } catch (err) {
        console.error('❌ Failed:', err.message);
    }
}

test();
