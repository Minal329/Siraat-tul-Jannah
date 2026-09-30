-- CreateEnum
CREATE TYPE "LivePlatform" AS ENUM ('ZOOM', 'WHATSAPP');

-- AlterTable
ALTER TABLE "class_groups" ADD COLUMN     "zoom_join_url" TEXT;

-- AlterTable
ALTER TABLE "class_sessions" ADD COLUMN     "ended_at" TIMESTAMP(3),
ADD COLUMN     "live_note" TEXT,
ADD COLUMN     "live_platform" "LivePlatform",
ADD COLUMN     "started_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "session_joins" (
    "id" UUID NOT NULL,
    "class_session_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "platform" "LivePlatform" NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_joins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "session_joins_student_id_idx" ON "session_joins"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_joins_class_session_id_student_id_key" ON "session_joins"("class_session_id", "student_id");

-- AddForeignKey
ALTER TABLE "session_joins" ADD CONSTRAINT "session_joins_class_session_id_fkey" FOREIGN KEY ("class_session_id") REFERENCES "class_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_joins" ADD CONSTRAINT "session_joins_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
