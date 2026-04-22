require('dotenv').config();
const { generateImage } = require('./src/services/imageService');

async function test() {
  console.log("Testing Hugging Face image generation...");
  try {
    const start = Date.now();
    const result = await generateImage("A glowing neon cat in cyberpunk city");
    const elapsed = Date.now() - start;
    
    if (result.image) {
      console.log(`\n✅ Success! Image generated in ${elapsed}ms`);
      console.log(`Base64 length : ${result.image.length} characters`);
      console.log(`MimeType      : ${result.mimeType}`);
      console.log(`Model Used    : ${result.model}`);
    } else {
      console.log("\n⚠️ Fallback triggered:");
      console.log(result);
    }
  } catch (err) {
    console.error("\n❌ Test failed:", err);
  }
}

test();
