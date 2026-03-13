require('dotenv').config();
const { processMessage } = require('../src/services/agentService');
const prisma = require('../src/config/database');

async function test() {
    console.log("Testing processMessage with PLAY_MUSIC:");
    const res1 = await processMessage('cm7z29vj20000m9r2vwz1n2t9', "play rang sharbaton ka", []);
    console.log("Response 1:", JSON.stringify(res1, null, 2));

    console.log("\nTesting processMessage with OPEN_URL:");
    const res2 = await processMessage('cm7z29vj20000m9r2vwz1n2t9', "open google.com", []);
    console.log("Response 2:", JSON.stringify(res2, null, 2));

    process.exit(0);
}

test().catch(err => {
    console.error(err);
    process.exit(1);
});
