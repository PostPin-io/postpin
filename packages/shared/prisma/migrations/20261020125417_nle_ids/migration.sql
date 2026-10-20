/*
  Warnings:

  - A unique constraint covering the columns `[nleProjectId]` on the table `project` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[nleTimelineId]` on the table `timeline` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "export" ADD COLUMN     "timelineSnapshotHash" TEXT;

-- AlterTable
ALTER TABLE "project" ADD COLUMN     "nleProjectId" TEXT;

-- AlterTable
ALTER TABLE "timeline" ADD COLUMN     "nleTimelineId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "project_nleProjectId_key" ON "project"("nleProjectId");

-- CreateIndex
CREATE UNIQUE INDEX "timeline_nleTimelineId_key" ON "timeline"("nleTimelineId");
