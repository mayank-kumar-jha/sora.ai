require('dotenv').config({ path: '.env' });
const { Pinecone } = require('@pinecone-database/pinecone');

const test = async () => {
    try {
        const pc = new Pinecone({ apiKey: process.env.VECTOR_DB_API_KEY });
        const index = pc.index(process.env.VECTOR_DB_INDEX);
        
        console.log("Upserting test vector...");
        const res = await index.upsert([{
            id: 'test-vec',
            values: new Array(768).fill(0).map(() => Math.random()),
        }]);
        console.log("Upsert result:", res);

        console.log("Fetching test vector...");
        const fetchRes = await index.fetch(['test-vec']);
        console.log("Fetch:", Object.keys(fetchRes.records));
    } catch (err) {
        console.error("Error:", err);
    }
}
test();
