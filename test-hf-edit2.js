require('dotenv').config();
const { HfInference } = require('@huggingface/inference');

const hf = new HfInference(process.env.HUGGINGFACE_API_KEY);

const modelsToTest = [
    'CompVis/stable-diffusion-v1-4',
    'SG161222/Realistic_Vision_V1.4',
    'prompthero/openjourney-v4',
    'black-forest-labs/FLUX.1-schnell' // Just to see if it works with imageToImage
];

async function run() {
    const baseImage = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 
        'base64'
    );
    const blob = new Blob([baseImage], { type: 'image/png' });

    for (const model of modelsToTest) {
        console.log(`\nTesting model: ${model}`);
        try {
            await hf.imageToImage({
                model: model,
                inputs: blob,
                parameters: { prompt: "a red square" }
            });
            console.log(`[SUCCESS] ${model} works!`);
            break;
        } catch (err) {
            console.log(`[FAILED] ${model} -> ${err.message}`);
        }
    }
}
run();
