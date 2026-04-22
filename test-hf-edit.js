require('dotenv').config();
const { HfInference } = require('@huggingface/inference');

const hf = new HfInference(process.env.HUGGINGFACE_API_KEY);

const modelsToTest = [
    'stabilityai/stable-diffusion-xl-refiner-1.0',
    'stabilityai/stable-diffusion-xl-base-1.0',
    'kandinsky-community/kandinsky-2-2-decoder-inpaint',
    'runwayml/stable-diffusion-v1-5'
];

async function run() {
    // Tiny valid PNG 1x1 black pixel
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
