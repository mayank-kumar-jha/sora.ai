require('dotenv').config();
const { processMessage } = require('../src/services/agentService');
const prisma = require('../src/config/database');

async function test() {
    console.log("Testing processMessage with WhatsApp System Ping:");
    const ping = `[SYSTEM: Incoming WhatsApp message from John: "Hello Sora". Please politely tell me who messaged me and what they said, and ask if I would like you to reply to them. Keep it short and conversational.]`;
    const res = await processMessage('cm7z29vj20000m9r2vwz1n2t9', ping, []);
    console.log("Response:", JSON.stringify(res, null, 2));
    process.exit(0);
}

test().catch(err => {
    console.error(err);
    process.exit(1);
});
