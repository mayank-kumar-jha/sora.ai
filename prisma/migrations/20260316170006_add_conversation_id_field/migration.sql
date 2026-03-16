-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "conversation_id" TEXT;

-- CreateIndex
CREATE INDEX "conversations_conversation_id_idx" ON "conversations"("conversation_id");
