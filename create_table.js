const { Client } = require('pg');

async function main() {
  const client = new Client({
    connectionString: "postgresql://postgres:yash91597%40@db.ycmccjentuiwjndiuaxe.supabase.co:5432/postgres",
    connectionTimeoutMillis: 10000,
  });

  try {
    await client.connect();
    console.log('Connected!');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "whatsapp_keys" (
        "id" TEXT NOT NULL,
        "data" JSONB NOT NULL,
        CONSTRAINT "whatsapp_keys_pkey" PRIMARY KEY ("id")
      );
    `);
    console.log('Table whatsapp_keys created or already exists.');

    // Also update whatsapp_sessions if needed
    // The previous migration would have done this too.
    
    await client.end();
    console.log('Done.');
  } catch (err) {
    console.error('Connection failed:', err.message);
    process.exit(1);
  }
}

main();
