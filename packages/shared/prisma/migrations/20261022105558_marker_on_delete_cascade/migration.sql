-- DropForeignKey
ALTER TABLE "marker" DROP CONSTRAINT "marker_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "marker" DROP CONSTRAINT "marker_exportId_fkey";

-- AddForeignKey
ALTER TABLE "marker" ADD CONSTRAINT "marker_exportId_fkey" FOREIGN KEY ("exportId") REFERENCES "export"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marker" ADD CONSTRAINT "marker_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
