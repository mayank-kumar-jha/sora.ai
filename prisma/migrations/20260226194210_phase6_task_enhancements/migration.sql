-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('ONE_TIME', 'RECURRING');

-- AlterEnum
ALTER TYPE "TaskStatus" ADD VALUE 'FAILED';

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "description" TEXT,
ADD COLUMN     "last_run_at" TIMESTAMP(3),
ADD COLUMN     "recurrence_rule" TEXT,
ADD COLUMN     "type" "TaskType" NOT NULL DEFAULT 'ONE_TIME';

-- CreateTable
CREATE TABLE "execution_logs" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "TaskStatus" NOT NULL,
    "output" TEXT,
    "error" TEXT,
    "executed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "execution_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "execution_logs_task_id_idx" ON "execution_logs"("task_id");

-- CreateIndex
CREATE INDEX "execution_logs_user_id_idx" ON "execution_logs"("user_id");

-- AddForeignKey
ALTER TABLE "execution_logs" ADD CONSTRAINT "execution_logs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
