
const { PrismaClient } = require('@prisma/client');

async function checkTables() {
  const url = "postgresql://postgres.ycmccjentuiwjndiuaxe:yash91597%40432432@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true";
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  try {
    await prisma.$connect();
    // Try to count users
    const count = await prisma.user.count();
    console.log(`✅ SUCCESS: Found ${count} users in the database.`);
    console.log("SCHEMA_READY");
  } catch (err) {
    if (err.message.includes('relation "users" does not exist')) {
        console.log("❌ SCHEMA_MISSING: The users table does not exist.");
    } else {
        console.error("❌ ERROR:", err.message);
    }
  } finally {
    await prisma.$disconnect();
  }
}

checkTables();
