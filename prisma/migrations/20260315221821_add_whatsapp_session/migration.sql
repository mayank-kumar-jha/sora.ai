-- CreateTable
CREATE TABLE "whatsapp_sessions" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "creds" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_sessions_pkey" PRIMARY KEY ("id")
);
