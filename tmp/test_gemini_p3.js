'use strict';

require('../src/config/env');
const geminiAgentService = require('../src/services/geminiAgentService');

async function testGemini() {
    console.log('\n--- TESTING GEMINI PHASE 3 FEATURES ---\n');
    
    const userId = '019cd4ee-272e-7149-b0d6-1234011e3942'; // Mock UUID user
    
    // 1. Test Web Search
    console.log('Testing Web Search Tool...');
    const searchRes = await geminiAgentService.processMessageWithTools(
        userId, 
        "Sora, what is the current weather in New York? Use web search."
    );
    console.log('Search Response:', JSON.stringify(searchRes, null, 2));
    
    // 2. Test Sentiment Tagging
    console.log('\nTesting Sentiment Tagging...');
    const sentimentRes = await geminiAgentService.processMessageWithTools(
        userId, 
        "Tell me a joke and be very happy about it."
    );
    console.log('Sentiment Response:', sentimentRes.message);
    
    process.exit(0);
}

testGemini().catch(err => {
    console.error('Test Failed:', err);
    process.exit(1);
});
