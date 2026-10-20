/*
  Warnings:

  - A unique constraint covering the columns `[nleId]` on the table `marker` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "marker" ADD COLUMN     "nleId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "marker_nleId_key" ON "marker"("nleId");
