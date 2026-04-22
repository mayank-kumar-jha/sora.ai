// test-socket.js — Test the standard AI chat via Socket.IO
const { io } = require("socket.io-client");
const jwt = require("jsonwebtoken");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

// Auto-generate token
const JWT_SECRET = process.env.JWT_SECRET || "kaaya_default_secret_fallback";
const TOKEN = jwt.sign(
  { sub: "test-user-001", email: "test@kaaya.ai", role: "user" },
  JWT_SECRET,
  { expiresIn: "1h" }
);

console.log("\n🔗 Connecting to http://localhost:3000...\n");

const socket = io("http://localhost:3000", {
  auth: { token: TOKEN },
  transports: ["websocket"],
});

socket.on("connect", () => {
  console.log("✅ Connected to Kaaya API via Socket.IO");

  // Ask Kaaya a question - concatenate all arguments to avoid PowerShell quote parsing bugs
  const queryArgs = process.argv.slice(2);
  const query = queryArgs.length > 0 ? queryArgs.join(" ").replace(/^["']|["']$/g, '') : "What is the current price of Bitcoin? Search the web.";

  console.log(`\n🗣️ Asking: "${query}"\n`);

  socket.emit("ai:chat", { message: query });
});

socket.on("ai:thought", (data) => console.log(`\n🤔 [Thinking]: ${data.content}\n`));
socket.on("ai:token", (data) => process.stdout.write(data.content));
socket.on("ai:audio", (data) => {
  console.log(`\n🔊 [Audio chunk] length: ${data.payload.length}`);
});
socket.on("ai:complete", () => {
  console.log("\n\n✅ Response Complete!");
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

// Timeout after 30s
setTimeout(() => {
  console.log("\n⏰ Timeout reached.");
  process.exit(1);
}, 30000);
