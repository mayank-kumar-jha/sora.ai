require('dotenv').config();
const https = require('https');

const options = {
    hostname: 'api.elevenlabs.io',
    path: '/v1/voices',
    method: 'GET',
    headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY
    }
};

const req = https.request(options, res => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        const voices = JSON.parse(data).voices;
        if (voices && voices.length > 0) {
            console.log('Available voices:', voices.slice(0, 5).map(v => `${v.name} (${v.voice_id})`));
        } else {
            console.log('No voices found or error:', data);
        }
    });
});
req.end();
