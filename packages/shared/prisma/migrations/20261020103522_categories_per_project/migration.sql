/*
  Warnings:

  - A unique constraint covering the columns `[projectId,name]` on the table `category` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `projectId` to the `category` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "category" ADD COLUMN     "projectId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "category_projectId_name_key" ON "category"("projectId", "name");

-- AddForeignKey
ALTER TABLE "category" ADD CONSTRAINT "category_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
