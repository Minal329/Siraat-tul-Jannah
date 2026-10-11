-- AlterTable
ALTER TABLE "certificates" ADD COLUMN     "finished_image_key" TEXT,
ADD COLUMN     "template_key" TEXT;

-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "certificate_template_key" TEXT;
