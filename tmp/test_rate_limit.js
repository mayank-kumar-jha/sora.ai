const http = require('http');

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    }
};

const postData = JSON.stringify({
    email: 'test@example.com',
    password: 'password123'
});

async function makeRequest(i) {
    return new Promise((resolve) => {
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                console.log(`Request ${i}: Status ${res.statusCode} - ${data}`);
                resolve(res.statusCode);
            });
        });

        req.on('error', (e) => {
            console.error(`Problem with request ${i}: ${e.message}`);
            resolve(500);
        });

        req.write(postData);
        req.end();
    });
}

async function runTests() {
    console.log('Sending 15 requests...');
    for (let i = 1; i <= 15; i++) {
        await makeRequest(i);
        await new Promise(r => setTimeout(r, 50));
    }
}

runTests();
