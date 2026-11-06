/*
  Warnings:

  - A unique constraint covering the columns `[organizationId,nleProjectId]` on the table `project` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "project_nleProjectId_key";

-- DropIndex
DROP INDEX "timeline_nleTimelineId_key";

-- CreateIndex
CREATE UNIQUE INDEX "project_organizationId_nleProjectId_key" ON "project"("organizationId", "nleProjectId");
