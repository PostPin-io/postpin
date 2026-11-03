-- The same NLE marker ends up in every export of a timeline, so nleId is unique per export, not globally

-- DropIndex
DROP INDEX "marker_nleId_key";

-- CreateIndex
CREATE UNIQUE INDEX "marker_exportId_nleId_key" ON "marker"("exportId", "nleId");
