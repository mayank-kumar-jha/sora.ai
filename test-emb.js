require('dotenv').config({ path: '.env' });
const { GoogleGenerativeAI } = require('@google/generative-ai');

const test = async () => {
    try {
        const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const modelNames = ['text-embedding-004', 'embedding-001'];
        for (const name of modelNames) {
            try {
                const model = ai.getGenerativeModel({ model: name });
                const result = await model.embedContent("Hello world");
                console.log(`Success ${name}! Dims:`, result.embedding.values.length);
            } catch (err) {
                console.log(`Failed ${name}:`, err.message);
            }
        }
    } catch (err) {
        console.error("Error:", err);
    }
}
test();
