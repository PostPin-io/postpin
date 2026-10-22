-- DropForeignKey
ALTER TABLE "category" DROP CONSTRAINT "category_projectId_fkey";

-- DropForeignKey
ALTER TABLE "response" DROP CONSTRAINT "response_markerId_fkey";

-- AddForeignKey
ALTER TABLE "category" ADD CONSTRAINT "category_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "response" ADD CONSTRAINT "response_markerId_fkey" FOREIGN KEY ("markerId") REFERENCES "marker"("id") ON DELETE CASCADE ON UPDATE CASCADE;
