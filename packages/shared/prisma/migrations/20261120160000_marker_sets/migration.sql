-- CreateEnum
CREATE TYPE "MarkerSetAction" AS ENUM ('PUSH', 'PULL', 'CLEAR', 'RESTORE');

-- AlterTable
ALTER TABLE "marker" ADD COLUMN     "nleTimelineId" TEXT,
ADD COLUMN     "syncHash" TEXT;

-- CreateTable
CREATE TABLE "deleted_marker" (
    "markerId" TEXT NOT NULL,
    "exportId" TEXT NOT NULL,
    "nleId" TEXT,
    "nleTimelineId" TEXT,
    "syncHash" TEXT,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deleted_marker_pkey" PRIMARY KEY ("markerId")
);

-- CreateTable
CREATE TABLE "marker_set" (
    "id" TEXT NOT NULL,
    "action" "MarkerSetAction" NOT NULL,
    "timelineId" TEXT NOT NULL,
    "exportId" TEXT,
    "nleTimelineId" TEXT NOT NULL,
    "nleTimelineName" TEXT,
    "hostName" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary" JSONB NOT NULL,
    "nleMarkers" JSONB NOT NULL,
    "postpinMarkers" JSONB,

    CONSTRAINT "marker_set_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deleted_marker_exportId_idx" ON "deleted_marker"("exportId");

-- CreateIndex
CREATE INDEX "marker_set_timelineId_nleTimelineId_createdAt_idx" ON "marker_set"("timelineId", "nleTimelineId", "createdAt");

-- CreateIndex
CREATE INDEX "marker_set_exportId_idx" ON "marker_set"("exportId");

-- CreateIndex
CREATE INDEX "marker_set_createdById_idx" ON "marker_set"("createdById");

-- AddForeignKey
ALTER TABLE "deleted_marker" ADD CONSTRAINT "deleted_marker_exportId_fkey" FOREIGN KEY ("exportId") REFERENCES "export"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marker_set" ADD CONSTRAINT "marker_set_timelineId_fkey" FOREIGN KEY ("timelineId") REFERENCES "timeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marker_set" ADD CONSTRAINT "marker_set_exportId_fkey" FOREIGN KEY ("exportId") REFERENCES "export"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marker_set" ADD CONSTRAINT "marker_set_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

