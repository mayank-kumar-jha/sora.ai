// test-vision.js — Test standard Vision capabilities (Image Recognition)
const { io } = require("socket.io-client");
const jwt = require("jsonwebtoken");
const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

// Auto-generate token
const JWT_SECRET = process.env.JWT_SECRET || "kaaya_default_secret_fallback";
const TOKEN = jwt.sign(
    { sub: "test-user-001", email: "test@kaaya.ai", role: "user" },
    JWT_SECRET,
    { expiresIn: "1h" }
);

const args = process.argv.slice(2);
const query = args.length > 0 ? args.join(" ").replace(/^["']|["']$/g, '') : "Describe what you see in this image in detail.";
const imagePath = path.join(__dirname, 'whatsapp-qr.png');

if (!fs.existsSync(imagePath)) {
    console.error("❌ Need an image to test! Expected 'whatsapp-qr.png' in the root directory.");
    process.exit(1);
}

const base64Image = fs.readFileSync(imagePath).toString('base64');

console.log("\n🔗 Connecting to standard Kaaya socket...");

const socket = io("http://localhost:3000", {
    auth: { token: TOKEN },
    transports: ["websocket"],
});

socket.on("connect", () => {
    console.log("✅ Connected! Uploading image and asking question...");
    console.log(`🗣️ Query: "${query}"\n`);

    socket.emit("ai:chat", {
        message: query,
        image: base64Image
    });
});

socket.on("ai:token", (data) => process.stdout.write(data.content));
socket.on("ai:audio", () => { /* ignore */ });

socket.on("ai:complete", () => {
    console.log("\n\n✅ Vision Analysis Complete!");
    setTimeout(() => process.exit(0), 1000);
});

socket.on("connect_error", (err) => {
    console.error("\n❌ Connection Error:", err.message);
    process.exit(1);
});
socket.on("ai:error", (err) => {
    console.error("\n❌ AI Error:", err.message);
    process.exit(1);
});

setTimeout(() => { console.log("\n⏰ Timeout reached."); process.exit(1); }, 30000);
