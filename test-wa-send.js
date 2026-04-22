// test-wa-send.js — Test sending a WhatsApp message via REST API
require('dotenv').config();
const jwt = require('jsonwebtoken');

const args = process.argv.slice(2);
const to = args[0];
const message = args.slice(1).join(" ");

if (!to || !message) {
    console.error("\n❌ Usage: node test-wa-send.js <ContactName_or_Number> <Message...>");
    console.error("Example: node test-wa-send.js mom Hello, I will be late!");
    process.exit(1);
}

// Generate Admin Token
const JWT_SECRET = process.env.JWT_SECRET || "kaaya_default_secret_fallback";
const TOKEN = jwt.sign(
    { sub: "test-user-001", email: "test@kaaya.ai", role: "admin" },
    JWT_SECRET,
    { expiresIn: "10m" }
);

(async () => {
    console.log("🔗 Executing WhatsApp API call...\n");
    try {
        const response = await fetch('http://localhost:3000/api/whatsapp/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${TOKEN}`
            },
            body: JSON.stringify({ to, message })
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error?.message || JSON.stringify(data));
        }

        console.log(`📤 Message Sent via API to: "${to}"`);
        console.log(`✉️  Content: "${message}"\n`);
        console.log("✅ API Result:", data);
    } catch (err) {
        if (err.message.includes('fetch failed')) {
            console.error("\n❌ Request failed. Ensure your backend is running (`npm run dev`)!");
        } else {
            console.error("\n❌ Error Sending Message:", err.message);
        }
        process.exit(1);
    }
})();
