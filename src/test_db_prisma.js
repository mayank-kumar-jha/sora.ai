
const { PrismaClient } = require('@prisma/client');

async function testConnection() {
  const url = "postgresql://postgres.ycmccjentuiwjndiuaxe:yash91597%40432432@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres";
  console.log(`Testing Prisma with URL: ${url.replace(/:[^:@]+@/, ':****@')}`);
  
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: url
      }
    }
  });

  try {
    await prisma.$connect();
    console.log("✅ SUCCESS! Prisma connected to Supabase.");
    const res = await prisma.$queryRaw`SELECT NOW()`;
    console.log("Result:", res);
  } catch (err) {
    console.error("❌ FAILED:", err.message);
    if (err.stack) console.log(err.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();
