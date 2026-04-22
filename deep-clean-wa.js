const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

async function clean() {
  try {
    console.log("Cleaning WhatsApp Session...");
    await prisma.whatsAppSession.deleteMany({});
    console.log("Cleaning WhatsApp Keys...");
    await prisma.whatsAppKey.deleteMany({});
    
    const storeFile = path.join(process.cwd(), 'data', 'whatsapp_store.json');
    if (fs.existsSync(storeFile)) {
      fs.unlinkSync(storeFile);
      console.log("Removed whatsapp_store.json");
    }
    
    console.log("Cleanup complete!");
  } catch (err) {
    console.error("Cleanup failed:", err.message);
  } finally {
    await prisma.$disconnect();
  }
}

clean();
