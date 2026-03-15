
const { Client } = require('pg');

async function testConnection() {
  // Trying both Direct and Pooler
  const urls = [
      "postgresql://postgres.ycmccjentuiwjndiuaxe:yash91597%40432432@db.ycmccjentuiwjndiuaxe.supabase.co:5432/postgres",
      "postgresql://postgres.ycmccjentuiwjndiuaxe:yash91597%40432432@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres"
  ];

  for (const url of urls) {
      console.log(`Testing URL: ${url.replace(/:[^:@]+@/, ':****@')}`);
      const client = new Client({ connectionString: url });
      try {
          await client.connect();
          console.log("✅ SUCCESS!");
          const res = await client.query('SELECT NOW()');
          console.log("Result:", res.rows[0]);
          await client.end();
          break; // Stop if one works
      } catch (err) {
          console.error("❌ FAILED:", err.message);
          if (err.stack) console.log(err.stack);
      }
  }
}

testConnection();
