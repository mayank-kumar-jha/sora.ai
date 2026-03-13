require('dotenv').config({ path: 'c:/Users/hp/Downloads/mayanks projects/antigravity/sora/.env' });
const { getChatCompletion } = require('c:/Users/hp/Downloads/mayanks projects/antigravity/sora/src/services/aiService');

(async () => {
    try {
        console.log("Calling Groq API...");
        const res = await getChatCompletion([
            { role: 'system', content: 'Reply mathematically.' },
            { role: 'user', content: 'What is 2+2?' }
        ]);
        console.log("Success:", res);
    } catch (err) {
        console.error("Failed:", err);
    }
})();
