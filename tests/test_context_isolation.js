const axios = require('axios');
require('dotenv').config();

const BASE_URL = 'http://localhost:3000/api';
let token = '';

async function testIsolation() {
    console.log('--- Starting Context Isolation Test ---');
    
    try {
        // 1. Login to get token (assuming user exists)
        const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
            email: 'test@example.com',
            password: 'password123'
        });
        token = loginRes.data.data.token;
        console.log('Logged in successfully');

        const headers = { Authorization: `Bearer ${token}` };

        // 2. Set context A
        console.log('Setting context in Session A...');
        await axios.post(`${BASE_URL}/ai/message`, {
            message: 'My favorite color is Blue. [SHHHHH]',
            conversationId: 'session_A'
        }, { headers });

        // 3. Set context B
        console.log('Setting context in Session B...');
        await axios.post(`${BASE_URL}/ai/message`, {
            message: 'My favorite color is Red. [SHHHHH]',
            conversationId: 'session_B'
        }, { headers });

        // 4. Query Session A
        console.log('Querying Session A...');
        const resA = await axios.post(`${BASE_URL}/ai/message`, {
            message: 'What is my favorite color?',
            conversationId: 'session_A'
        }, { headers });
        console.log(`Session A Response: ${resA.data.data.message}`);

        // 5. Query Session B
        console.log('Querying Session B...');
        const resB = await axios.post(`${BASE_URL}/ai/message`, {
            message: 'What is my favorite color?',
            conversationId: 'session_B'
        }, { headers });
        console.log(`Session B Response: ${resB.data.data.message}`);

        if (resA.data.data.message.toLowerCase().includes('blue') && resB.data.data.message.toLowerCase().includes('red')) {
            console.log('SUCCESS: Context is properly isolated between sessions!');
        } else {
            console.log('FAILURE: Context leaked between sessions.');
        }

    } catch (err) {
        console.error('Test failed:', err.response?.data || err.message);
    }
}

testIsolation();
