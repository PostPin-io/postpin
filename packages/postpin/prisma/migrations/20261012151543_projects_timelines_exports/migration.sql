-- CreateTable
CREATE TABLE "project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "creatorId" TEXT NOT NULL,

    CONSTRAINT "project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timeline" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "timeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "timelineId" TEXT NOT NULL,

    CONSTRAINT "export_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_creatorId_idx" ON "project"("creatorId");

-- CreateIndex
CREATE INDEX "timeline_projectId_idx" ON "timeline"("projectId");

-- CreateIndex
CREATE INDEX "export_timelineId_idx" ON "export"("timelineId");

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline" ADD CONSTRAINT "timeline_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export" ADD CONSTRAINT "export_timelineId_fkey" FOREIGN KEY ("timelineId") REFERENCES "timeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;
