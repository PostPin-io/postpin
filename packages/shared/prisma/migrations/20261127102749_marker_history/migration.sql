-- CreateEnum
CREATE TYPE "MarkerUndoAction" AS ENUM ('CREATE', 'UPDATE', 'BATCH_UPDATE', 'DELETE', 'PASTE', 'CUT');

-- CreateTable
CREATE TABLE "marker_undo_step" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "guestId" TEXT,
    "action" "MarkerUndoAction" NOT NULL,
    "label" TEXT NOT NULL,
    "coalesceKey" TEXT,
    "exportIds" TEXT[],
    "markerIds" TEXT[],
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "undoneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marker_undo_step_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marker_clipboard" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "guestId" TEXT,
    "sourceExportId" TEXT NOT NULL,
    "markerIds" TEXT[],
    "mode" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marker_clipboard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "marker_undo_step_userId_createdAt_idx" ON "marker_undo_step"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "marker_undo_step_guestId_createdAt_idx" ON "marker_undo_step"("guestId", "createdAt");

-- CreateIndex
CREATE INDEX "marker_undo_step_createdAt_idx" ON "marker_undo_step"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "marker_clipboard_userId_key" ON "marker_clipboard"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "marker_clipboard_guestId_key" ON "marker_clipboard"("guestId");

-- AddForeignKey
ALTER TABLE "marker_undo_step" ADD CONSTRAINT "marker_undo_step_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marker_undo_step" ADD CONSTRAINT "marker_undo_step_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "share_guest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marker_clipboard" ADD CONSTRAINT "marker_clipboard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marker_clipboard" ADD CONSTRAINT "marker_clipboard_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "share_guest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Prisma can't express CHECKs; it ignores them when diffing
ALTER TABLE "marker_undo_step" ADD CONSTRAINT "marker_undo_step_owner_check"
  CHECK (num_nonnulls("userId", "guestId") = 1);
ALTER TABLE "marker_clipboard" ADD CONSTRAINT "marker_clipboard_owner_check"
  CHECK (num_nonnulls("userId", "guestId") = 1);
