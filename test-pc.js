require('dotenv').config({ path: '.env' });
const vectorDbService = require('./src/services/vectorDbService');
const { Pinecone } = require('@pinecone-database/pinecone');

const test = async () => {
    try {
        const pc = new Pinecone({ apiKey: process.env.VECTOR_DB_API_KEY });
        const index = pc.index(process.env.VECTOR_DB_INDEX);
        const stats = await index.describeIndexStats();
        console.log("Stats:", stats);
        
        // Fetch the vector we just upserted
        const fetchRes = await index.fetch(['doc-826a9151-305f-410c-87b2-38dd8d99b60c']);
        console.log("Fetch:", Object.keys(fetchRes.records));
    } catch (err) {
        console.error("Error:", err);
    }
}
test();
