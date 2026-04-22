require('dotenv').config({ path: '.env' });
const ragService = require('./src/services/ragService');
const vectorDbService = require('./src/services/vectorDbService');

const test = async () => {
   try {
       console.log("Searching for color and passcode");
       const res = await ragService.query("What is my favorite color and passcode?", "eec85e0f-6c20-44de-811d-ecb3b9e9e546");
       console.log("RAG query result:", res);
   } catch (err) {
       console.error("Error:", err);
   }
}
test();
