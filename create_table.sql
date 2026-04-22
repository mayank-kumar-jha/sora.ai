CREATE TABLE IF NOT EXISTS "whatsapp_keys" (
  "id" TEXT NOT NULL,
  "data" JSONB NOT NULL,
  CONSTRAINT "whatsapp_keys_pkey" PRIMARY KEY ("id")
);
