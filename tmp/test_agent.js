require('dotenv').config({ path: 'c:/Users/hp/Downloads/mayanks projects/antigravity/sora/.env' });
const { processMessage } = require('c:/Users/hp/Downloads/mayanks projects/antigravity/sora/src/services/agentService');

(async () => {
    try {
        console.log("Calling Groq API via Agent...");
        const res = await processMessage("test-user-id", "Hello Sora, tell me my next task!");
        console.log("Success:", JSON.stringify(res, null, 2));
        process.exit(0);
    } catch (err) {
        console.error("Failed:", err);
        process.exit(1);
    }
})();
