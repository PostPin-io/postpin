-- AlterTable
ALTER TABLE "export" ADD COLUMN     "uploadedById" TEXT;

-- AlterTable
ALTER TABLE "organization" ADD COLUMN     "storageQuota" BIGINT;

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "storageQuota" BIGINT;

-- CreateIndex
CREATE INDEX "export_uploadedById_idx" ON "export"("uploadedById");

-- AddForeignKey
ALTER TABLE "export" ADD CONSTRAINT "export_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
