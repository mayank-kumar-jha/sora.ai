-- AlterTable
ALTER TABLE "whatsapp_sessions" ADD COLUMN     "last_qr_code" TEXT;

-- CreateTable
CREATE TABLE "whatsapp_keys" (
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "whatsapp_keys_pkey" PRIMARY KEY ("id")
);
