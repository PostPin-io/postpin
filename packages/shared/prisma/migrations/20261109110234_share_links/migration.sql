-- No code created share links before this migration; drop leftovers from dev data
DELETE FROM "share_link";

/*
  Warnings:

  - A unique constraint covering the columns `[guestCategoryId]` on the table `project` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[token]` on the table `share_link` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `expiresAt` to the `share_link` table without a default value. This is not possible if the table is not empty.
  - Added the required column `token` to the `share_link` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "marker" ADD COLUMN     "guestId" TEXT;

-- AlterTable
ALTER TABLE "project" ADD COLUMN     "guestCategoryId" TEXT;

-- AlterTable
ALTER TABLE "share_link" ADD COLUMN     "expiresAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "revokedAt" TIMESTAMP(3),
ADD COLUMN     "timelinePanelVisible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "token" TEXT NOT NULL,
ALTER COLUMN "markerPanelVisible" SET DEFAULT true;

-- CreateTable
CREATE TABLE "share_guest" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shareLinkId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sessionTokenHash" TEXT NOT NULL,

    CONSTRAINT "share_guest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "share_guest_sessionTokenHash_key" ON "share_guest"("sessionTokenHash");

-- CreateIndex
CREATE INDEX "share_guest_shareLinkId_idx" ON "share_guest"("shareLinkId");

-- CreateIndex
CREATE INDEX "marker_guestId_idx" ON "marker"("guestId");

-- CreateIndex
CREATE UNIQUE INDEX "project_guestCategoryId_key" ON "project"("guestCategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "share_link_token_key" ON "share_link"("token");

-- AddForeignKey
ALTER TABLE "marker" ADD CONSTRAINT "marker_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "share_guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_guestCategoryId_fkey" FOREIGN KEY ("guestCategoryId") REFERENCES "category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_guest" ADD CONSTRAINT "share_guest_shareLinkId_fkey" FOREIGN KEY ("shareLinkId") REFERENCES "share_link"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Prisma can't express CHECKs; it ignores them when diffing
-- At most one author: a user, a share-link guest, or neither (NLE import, deleted user)
ALTER TABLE "marker"
  ADD CONSTRAINT "marker_at_most_one_author"
  CHECK (num_nonnulls("authorId", "guestId") <= 1);
