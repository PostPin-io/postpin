-- AlterTable
ALTER TABLE "share_link" ADD COLUMN     "categoryId" TEXT;

-- AddForeignKey
ALTER TABLE "share_link" ADD CONSTRAINT "share_link_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
